"""Headless Firefox harness for peperhide.
usage: py -3.14 ff.py <root> <probe.js> <out.json> [port] [WxH]
The probe is an async JS expression returning a JSON string/object.
In the page, `await window.__shot('name')` saves <out-dir>/<name>.png.
"""
import sys, json, asyncio, subprocess, time, os
from playwright.async_api import async_playwright
ROOT, PROBE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
PORT = int(sys.argv[4]) if len(sys.argv) > 4 else 8793
W, H = (int(v) for v in (sys.argv[5] if len(sys.argv) > 5 else '1280x720').split('x'))
pre = os.environ.get('MC_PRE', '')
probe = open(PROBE, encoding='utf8').read()
outdir = os.path.dirname(os.path.abspath(OUT))

async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(1.2)
        async with async_playwright() as p:
            b = await p.firefox.launch(headless=True)
            pg = await b.new_page(viewport={'width': W, 'height': H})
            errs, logs = [], []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: logs.append(m.text) if m.type in ('error', 'warning') else None)
            async def shot(name):
                path = os.path.join(outdir, name + '.png')
                await pg.screenshot(path=path)
                return path
            await pg.expose_function('__shot', shot)
            if pre:
                await pg.add_init_script(pre)
            await pg.goto(f'http://127.0.0.1:{PORT}/index.html')
            await pg.wait_for_function('window.__mc && typeof G!=="undefined" && G.phase!=="boot"', timeout=180000)
            t0 = time.time()
            res = await pg.evaluate(probe)
            data = json.loads(res) if isinstance(res, str) and res[:1] in '{[' else res
            open(OUT, 'w').write(json.dumps({'res': data, 'errors': errs, 'console': logs[:30], 'sec': round(time.time() - t0, 1)}, indent=1))
            print('ok errors', len(errs), 'sec', round(time.time() - t0, 1))
            for e in errs[:5]: print('ERR', e[:300])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
