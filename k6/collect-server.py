"""Read-only sampler. Stops on stdin EOF or after 30 minutes."""
import json, os, subprocess, sys, threading, time
from datetime import datetime, timezone

os.chdir('/opt/nisaab360/n360')
stop = threading.Event()
threading.Thread(target=lambda: (sys.stdin.read(), stop.set()), daemon=True).start()

def command(args):
    p = subprocess.run(args, capture_output=True, text=True, timeout=12)
    if p.returncode:
        return {'error': 'command failed', 'exit': p.returncode}
    return p.stdout.strip()

def emit(value):
    print(json.dumps(value), flush=True)

ids = command(['docker', 'compose', 'ps', '-q']).split()
containers = json.loads(command(['docker', 'inspect', *ids]))
services = [(c['Name'], c['State']['Pid']) for c in containers]
emit({'type': 'ready', 'time': datetime.now(timezone.utc).isoformat(),
      'revision': command(['git', 'rev-parse', 'HEAD']),
      'containers': [{'name': c['Name'], 'image': c['Image'], 'started': c['State']['StartedAt'],
                      'restarts': c['RestartCount'], 'oom': c['State']['OOMKilled']} for c in containers]})
deadline = time.monotonic() + 1800
while not stop.is_set() and time.monotonic() < deadline:
    row = {'type': 'sample', 'time': datetime.now(timezone.utc).isoformat(),
           'load': os.getloadavg(), 'memory': open('/proc/meminfo').read(),
           'cpu': open('/proc/stat').read().splitlines()[0],
           'network': open('/proc/net/dev').read(), 'namespaces': {}}
    for name, pid in services:
        if not any(s in name for s in ['app', 'caddy']):
            continue
        try:
            row['namespaces'][name] = {f: open('/proc/%s/net/%s' % (pid, f)).read()
                                      for f in ['netstat', 'snmp', 'sockstat']}
        except OSError:
            row['namespaces'][name] = {'error': 'process disappeared'}
    try:
        row['containers'] = command(['docker', 'stats', '--no-stream', '--format', '{{json .}}', *ids])
        # Aggregate only; never retain SQL text, account records, or credentials.
        row['database'] = command(['docker', 'compose', 'exec', '-T', 'postgres', 'sh', '-c',
            'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT state, wait_event_type, count(*) FROM pg_stat_activity GROUP BY state, wait_event_type"'])
    except subprocess.TimeoutExpired:
        row['error'] = 'sampling command timed out'
    emit(row)
    stop.wait(5)
