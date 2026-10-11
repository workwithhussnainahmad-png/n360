// Runs inside an app container. No restart, heap snapshot, or public inspector port.
const fs = require('node:fs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const stamp = process.argv[2];
  if (!/^cloud-[\dTZ-]+$/.test(stamp)) throw Error('Invalid profile stamp');
  const output = `/tmp/${stamp}.cpuprofile`;
  const pids = fs.readdirSync('/proc').filter(n => /^\d+$/.test(n)).filter(n => {
    try { const args = fs.readFileSync(`/proc/${n}/cmdline`, 'utf8').split('\0'); return args.some(a => a.endsWith('/standalone-server.cjs')) && Number(n) !== process.pid; }
    catch { return false; }
  });
  if (pids.length !== 1) throw Error('Expected one standalone app process');
  const targets = async () => {
    try { return await (await fetch('http://127.0.0.1:9229/json/list', {signal: AbortSignal.timeout(1000)})).json(); }
    catch { return []; }
  };
  if ((await targets()).length) throw Error('Inspector already active; refusing to disturb another session');
  process.kill(Number(pids[0]), 'SIGUSR1');
  let list = [];
  for (let i = 0; i < 30 && !list.length; i++) { await delay(100); list = await targets(); }
  if (list.length !== 1) throw Error('Inspector unavailable after activation; inspect container loopback port 9229');
  const socket = new WebSocket(list[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (entry) { pending.delete(message.id); clearTimeout(entry.timer); message.error ? entry.reject(Error(message.error.message)) : entry.resolve(message.result); }
  };
  const send = (method, params) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(Error('Inspector command timed out')); }, 10000);
    pending.set(key, {resolve, reject, timer}); socket.send(JSON.stringify({id:key, method, params}));
  });
  // The app owns the stop timer, so losing SSH cannot leave the profiler running.
  const expression = `(async () => {
    const inspector = process.getBuiltinModule('inspector');
    const fs = process.getBuiltinModule('fs');
    const session = new inspector.Session(); session.connect();
    const post = (method, params = {}) => new Promise((resolve,reject) => session.post(method,params,(err,result)=>err?reject(err):resolve(result)));
    const output = ${JSON.stringify(output)};
    try {
      await post('Profiler.enable');
      await post('Profiler.setSamplingInterval', {interval:10000});
      await post('Profiler.start');
      const startedAt = new Date().toISOString();
      setTimeout(async () => {
        try { const {profile} = await post('Profiler.stop'); fs.writeFileSync(output, JSON.stringify(profile), {mode:0o600}); }
        catch { fs.writeFileSync(output+'.error', 'CPU profile capture failed', {mode:0o600}); }
        finally { session.disconnect(); }
      }, 30000).unref();
      return {startedAt, seconds:30, samplingMicroseconds:10000};
    } catch (error) { session.disconnect(); throw error; }
  })()`;
  try {
    const result = await send('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true});
    if (result.exceptionDetails) throw Error('Could not start bounded CPU capture');
    console.error(JSON.stringify(result.result.value));
  } finally {
    try { await send('Runtime.evaluate', {expression:"setTimeout(() => process.getBuiltinModule('inspector').close(), 100); void 0"}); }
    finally { socket.close(); }
  }
  for (let i = 0; i < 450; i++) {
    if (fs.existsSync(output+'.error')) throw Error('Application could not save CPU profile');
    if (fs.existsSync(output)) { process.stdout.write(fs.readFileSync(output)); return; }
    await delay(100);
  }
  throw Error('Profile not available within 45 seconds');
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
