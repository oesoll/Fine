#!/usr/bin/env python3
"""Release Fine, no agent sessions: compare quiet host and static notch states."""
import ctypes
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / '.build/attention-review'
OUTPUT.mkdir(exist_ok=True)


class Usage(ctypes.Structure):
    _fields_ = [('uuid', ctypes.c_ubyte * 16)] + [(name, ctypes.c_uint64) for name in
                ('user', 'system', 'idle_wakeups', 'interrupt_wakeups', 'pageins', 'wired', 'rss', 'footprint', 'start', 'exit')]


libproc = ctypes.CDLL('/usr/lib/libproc.dylib')


with tempfile.TemporaryDirectory(prefix='fine-perf-', dir='/tmp') as directory:
    root = Path(directory)
    env = dict(os.environ, FINE_HOME=directory, CODEX_HOME=str(root / '.codex'), XDG_DATA_HOME=str(root / '.local/share'))
    log = (OUTPUT / 'resources-app.log').open('w')
    app = subprocess.Popen([str(ROOT / '.build/Fine.app/Contents/MacOS/Fine')], env=env, stdout=log, stderr=log)

    def rpc(command, args=None):
        with socket.socket(socket.AF_UNIX) as sock:
            sock.settimeout(5)
            sock.connect(str(root / '.fine/control.sock'))
            sock.sendall(json.dumps({'command': command, 'args': args or {}}).encode() + b'\n')
            response = json.loads(sock.makefile('rb').readline())
            assert response['ok'], response
            return response['result']

    def usage():
        value = Usage()
        assert libproc.proc_pid_rusage(app.pid, 0, ctypes.byref(value)) == 0
        return value

    def sample(label):
        before = usage(); started = time.monotonic()
        time.sleep(8)
        elapsed = time.monotonic() - started; after = usage()
        return {'state': label, 'seconds': round(elapsed, 2),
                'cpu_percent_one_core': round((after.user + after.system - before.user - before.system) / 1e9 / elapsed * 100, 3),
                'rss_mb': round(after.rss / 1024**2, 2), 'physical_footprint_mb': round(after.footprint / 1024**2, 2),
                'idle_wakeups': after.idle_wakeups - before.idle_wakeups}

    try:
        for _ in range(100):
            if (root / '.fine/control.sock').exists(): break
            time.sleep(.1)
        time.sleep(2)
        for window in rpc('windows.list'):
            rpc('window.close', {'window': window['id']})
        time.sleep(1)
        results = [sample('host_idle_no_windows')]
        rpc('attention.post', {'host': 'mac', 'key': 'measurement', 'title': '빌드', 'message': '작업 중', 'state': 'working'})
        time.sleep(1)
        results.append(sample('working_compact'))
        rpc('attention.post', {'host': 'mac', 'key': 'measurement', 'title': '빌드', 'message': '확인이 필요합니다.', 'state': 'waiting'})
        time.sleep(7)
        results.append(sample('waiting_compact'))
        evidence = {'build': 'Release', 'scope': 'whole isolated Fine process; no agent sessions or main windows; eight-second samples', 'samples': results}
        (OUTPUT / 'resources.json').write_text(json.dumps(evidence, indent=2))
        print(json.dumps(evidence, indent=2))
    finally:
        if app.poll() is None:
            app.terminate()
            try: app.wait(timeout=10)
            except subprocess.TimeoutExpired: app.kill(); app.wait()
        log.close()
