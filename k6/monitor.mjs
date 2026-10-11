import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';

export async function startMonitors(root, folder, key, remote, onFailure) {
  const processes = [];
  let stopping = false;
  function launch(name, executable, args) {
    const output = fs.createWriteStream(path.join(folder, `${name}.jsonl`));
    const errors = fs.createWriteStream(path.join(folder, `${name}-errors.log`));
    const child = spawn(executable, args, {windowsHide:true, stdio:['pipe','pipe','pipe']});
    processes.push(child);
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${name} did not become ready; no load started`)), 30000);
      child.stderr.pipe(errors);
      const lines = createInterface({input:child.stdout});
      lines.on('line', line => {
        try {
          const sample = JSON.parse(line);
          sample.receivedAt = new Date().toISOString();
          output.write(JSON.stringify(sample)+'\n');
          if (sample.type === 'ready') { clearTimeout(timer); resolve(); }
        } catch { errors.write('Non-JSON collector output\n'); }
      });
      child.once('error', () => {clearTimeout(timer);reject(new Error(`${name} could not start`));output.end();errors.end();});
      child.once('close', code => {
        clearTimeout(timer);
        output.end(JSON.stringify({type:'collector-exit',time:new Date().toISOString(),code,elapsedMs:Date.now()-started})+'\n');
        reject(new Error(`${name} exited before ready`));
        if (!stopping) onFailure(`${name} stopped unexpectedly`);
      });
    });
  }
  const stop = async () => {
    stopping = true;
    for (const child of processes) child.stdin.end();
    // EOF stops the remote Python collector; leave SSH time to deliver it.
    await new Promise(resolve => setTimeout(resolve, 1500));
    for (const child of processes) if (child.exitCode === null) child.kill();
  };
  try {
    const code = fs.readFileSync(path.join(root,'k6/collect-server.py')).toString('base64');
    await launch('server-metrics', 'ssh', ['-o','BatchMode=yes','-o','ConnectTimeout=15','-i',key,remote,
      `sudo -n python3 -u -c "import base64;exec(base64.b64decode('${code}'))"`]);
    await launch('pc-metrics', 'powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'k6/collect-pc.ps1')]);
    return stop;
  } catch (error) { await stop(); throw error; }
}
