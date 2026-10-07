import { Worker } from 'worker_threads';

const workerCode = `
const { parentPort } = require('worker_threads');
const argon2 = require('@node-rs/argon2');

parentPort.on('message', async (task) => {
  try {
    if (task.type === 'hash') {
      const result = await argon2.hash(task.password);
      parentPort.postMessage({ id: task.id, result });
    } else if (task.type === 'verify') {
      const result = await argon2.verify(task.hash, task.password);
      parentPort.postMessage({ id: task.id, result });
    }
  } catch (err) {
    parentPort.postMessage({ id: task.id, error: err.message });
  }
});
`;

type PendingCallback = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: NodeJS.Timeout;
  worker: Worker;
};

const numWorkers = 2;
const workers: Worker[] = [];
let nextWorkerIndex = 0;
let shuttingDown = false;

let msgId = 0;
const callbacks = new Map<number, PendingCallback>();
const MAX_QUEUE_SIZE = 100;
const TASK_TIMEOUT_MS = 30_000;

function rejectCallbacksForWorker(worker: Worker, reason: string) {
  for (const [id, cb] of callbacks) {
    if (cb.worker !== worker) continue;
    clearTimeout(cb.timer);
    callbacks.delete(id);
    cb.reject(new Error(reason));
  }
}

function rejectAllPending(reason: string) {
  for (const [id, cb] of callbacks) {
    clearTimeout(cb.timer);
    cb.reject(new Error(reason));
    callbacks.delete(id);
  }
}

function removeWorker(worker: Worker) {
  const index = workers.indexOf(worker);
  if (index >= 0) workers.splice(index, 1);
}

function spawnWorker(): Worker {
  const worker = new Worker(workerCode, { eval: true });

  worker.on('message', (msg) => {
    const cb = callbacks.get(msg.id);
    if (!cb) return;
    clearTimeout(cb.timer);
    callbacks.delete(msg.id);
    if (msg.error) cb.reject(new Error(msg.error));
    else cb.resolve(msg.result);
  });

  worker.on('error', (err) => {
    console.error('argon2 worker error:', err);
  });

  // Reap crashed workers: fail their in-flight jobs and replace the thread
  // so we don't leave dead workers burning RAM/CPU with hung callbacks.
  worker.on('exit', (code) => {
    rejectCallbacksForWorker(worker, `Argon2 worker exited (code=${code})`);
    removeWorker(worker);
    if (shuttingDown) return;
    console.warn(`argon2 worker exited (code=${code}); respawning`);
    try {
      workers.push(spawnWorker());
    } catch (err) {
      console.error('argon2 worker respawn failed:', err);
    }
  });

  return worker;
}

function initWorkers() {
  if (workers.length === 0 && !shuttingDown) {
    for (let i = 0; i < numWorkers; i++) {
      workers.push(spawnWorker());
    }
  }
}

function getWorker() {
  initWorkers();
  if (workers.length === 0) {
    throw new Error('Argon2 workers unavailable');
  }
  const worker = workers[nextWorkerIndex % workers.length];
  nextWorkerIndex = (nextWorkerIndex + 1) % workers.length;
  return worker;
}

function enqueue<T>(payload: Record<string, unknown>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (shuttingDown) return reject(new Error('Argon2 workers shutting down'));
    if (callbacks.size >= MAX_QUEUE_SIZE) return reject(new Error('Argon2 worker queue full'));

    let worker: Worker;
    try {
      worker = getWorker();
    } catch (err) {
      return reject(err instanceof Error ? err : new Error(String(err)));
    }

    const id = msgId++;
    const timer = setTimeout(() => {
      if (!callbacks.has(id)) return;
      callbacks.delete(id);
      // Kill the stuck worker so argon2 CPU can't run forever after timeout.
      void worker.terminate().catch(() => undefined);
      reject(new Error('Argon2 worker task timed out'));
    }, TASK_TIMEOUT_MS);

    callbacks.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
      timer,
      worker,
    });

    try {
      worker.postMessage({ id, ...payload });
    } catch (err) {
      clearTimeout(timer);
      callbacks.delete(id);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export function hashPassword(password: string): Promise<string> {
  return enqueue<string>({ type: 'hash', password });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return enqueue<boolean>({ type: 'verify', hash, password });
}

/** Terminate worker threads and fail any in-flight password jobs. */
export async function shutdownArgon2Pool(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  rejectAllPending('Argon2 workers shutting down');
  await Promise.all(
    workers.splice(0).map(async (worker) => {
      try {
        await worker.terminate();
      } catch {
        // ignore terminate races during shutdown
      }
    }),
  );
}
