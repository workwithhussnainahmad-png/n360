import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';

export async function captureProfiles(root, folder, key, host, stamp) {
  const destination = path.join(folder, 'profiles');
  fs.mkdirSync(destination, {recursive:true});
  const source = fs.readFileSync(path.join(root, 'k6/capture-node-profile.cjs'));
  const rows = [];
  const capture = (name, command, input) => new Promise(resolve => {
    const startedAt = new Date().toISOString();
    const output = fs.createWriteStream(path.join(destination, name));
    const errors = fs.createWriteStream(path.join(destination, name+'.log'));
    const child = spawn('ssh', ['-o','BatchMode=yes','-o','ConnectTimeout=15','-i',key,host,command], {windowsHide:true,stdio:['pipe','pipe','pipe']});
    child.stdout.pipe(output); child.stderr.pipe(errors);
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    const timer = setTimeout(() => child.kill(), 70000);
    child.on('error', () => {});
    child.once('close', code => {
      clearTimeout(timer);
      rows.push({file:name,startedAt,finishedAt:new Date().toISOString(),exitCode:code});
      resolve();
    });
  });
  console.log('Capturing 30 seconds of Caddy and both Node CPU profiles; test continues.');
  await Promise.all([
    capture('app.cpuprofile', `docker exec -i n360-app-1 node - ${stamp}`, source),
    capture('app2.cpuprofile', `docker exec -i nisaab360-app2 node - ${stamp}`, source),
    capture('caddy.pb.gz', 'docker exec n360-caddy-1 wget -q -O - "http://127.0.0.1:2019/debug/pprof/profile?seconds=30"'),
  ]);
  fs.writeFileSync(path.join(destination, 'capture.json'), JSON.stringify({rows,note:'Profiling changes measurement overhead. Compare against the unprofiled baseline; Node capture auto-stops in the app.'},null,2));
  console.log(rows.every(r=>r.exitCode===0)?'CPU profiles collected.':'Some profiles failed; see profiles/capture.json and logs. The load test continues.');
}
