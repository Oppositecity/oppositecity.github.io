"""Look at pages on the LIVE site, after Pages has published them, the way
scripts/sweep.py looks at them locally: phone, laptop and wide screenshots,
console errors, failed requests, and whether anything was drawn at all.

  python3 scripts/live-check.py OUT_DIR SHA slug [slug ...]   # '' or 'hub' = the hub

Run by .github/workflows/live-check.yml after every deploy. Results land on the
`checks` branch, so Claude in chat can read them with git. It measures; it does
not judge. A blank screenshot or a page error is the thing to look at first.
"""
import sys, os, json
from playwright.sync_api import sync_playwright
from PIL import Image

out, sha, slugs = sys.argv[1], sys.argv[2], sys.argv[3:] or ['hub']
os.makedirs(out, exist_ok=True)
BASE = os.environ.get('LIVE_BASE', 'https://opposite.city/')  # override to test locally
VP = {
    'phone':  dict(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True),
    'laptop': dict(viewport={'width': 1280, 'height': 800}),
    'wide':   dict(viewport={'width': 1920, 'height': 1080}),
}

def drawn(path):
    """Share of pixels that differ from the commonest colour. Near 0 = blank."""
    im = Image.open(path).convert('RGB').resize((160, 100))
    px = list(im.getdata())
    top = max(set(px), key=px.count)
    return round(sum(1 for p in px if p != top) / len(px), 3)

report = {'sha': sha, 'pages': {}}
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
                                '--autoplay-policy=no-user-gesture-required'])
    for slug in slugs:
        key = 'hub' if slug in ('', 'hub') else slug.strip('/')
        url = BASE + ('' if key == 'hub' else key + '/') + '?v=' + sha[:7]
        r = report['pages'].setdefault(key, {'url': url})
        for name, kw in VP.items():
            c = b.new_context(**kw); pg = c.new_page(); errs, fails = [], []
            pg.on('console', lambda m: errs.append(m.text[:160]) if m.type == 'error' else None)
            pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:160]))
            pg.on('requestfailed', lambda q: fails.append(q.url[:100]))
            pg.on('response', lambda q: fails.append(f'{q.status} {q.url[:100]}') if q.status >= 400 else None)
            shot = f"{out}/{key.replace('/', '_')}.{name}.png"
            try:
                resp = pg.goto(url, wait_until='load', timeout=30000)
                pg.wait_for_timeout(3000)
                pg.screenshot(path=shot)
                m = {'status': resp.status if resp else None, 'drawn': drawn(shot),
                     'hscroll': pg.evaluate('document.documentElement.scrollWidth-innerWidth'),
                     'title': pg.title()}
            except Exception as e:
                m = {'EXC': str(e)[:200]}
            m['errs'] = list(dict.fromkeys(errs))[:6]
            m['fails'] = list(dict.fromkeys(fails))[:6]
            r[name] = m
            c.close()
    b.close()

json.dump(report, open(f'{out}/report.json', 'w'), indent=1)
lines = [f'# live check of {sha[:7]}', '']
for key, r in report['pages'].items():
    lines.append(f"## {key}  {r['url']}")
    for name in VP:
        m = r.get(name, {})
        flag = []
        if m.get('EXC'): flag.append('FAILED TO LOAD')
        if m.get('drawn', 1) < 0.01: flag.append('BLANK')
        if m.get('errs'): flag.append(f"{len(m['errs'])} errors")
        if m.get('hscroll', 0) > 2: flag.append('sideways scroll')
        lines.append(f"- {name}: drawn {m.get('drawn')}  {', '.join(flag) or 'ok'}")
        for e in m.get('errs', []): lines.append(f'    - {e}')
    lines.append('')
open(f'{out}/report.md', 'w').write('\n'.join(lines))
print('\n'.join(lines))
