"""Make one share image per published piece: a 1200x630 picture of the piece
itself, saved to og/<slug>.png.

  python3 -m http.server 8000              # from the repo root, in another shell
  python3 scripts/share-images.py [slug ...]   # no slugs: every published piece

Needs: pip install playwright pillow; playwright install chromium.
A piece that opens on a "begin" gate is photographed after one tap in the
middle of the screen, so the picture shows the piece and not its door.
"""
import sys, os, json, io
from playwright.sync_api import sync_playwright
from PIL import Image
R=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
want=sys.argv[1:]
slugs=[(s['slug'],s['url'].replace('https://opposite.city','')) for s in json.load(open(R+'/surfaces.json'))['surfaces'] if not want or s['slug'] in want]
os.makedirs(R+'/og',exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required','--use-gl=swiftshader'])
    c=b.new_context(viewport={'width':1200,'height':630},device_scale_factor=1,reduced_motion='no-preference')
    for s,path in slugs:
        pg=c.new_page()
        try:
            pg.goto('http://localhost:8000'+path,wait_until='load',timeout=20000)
            pg.wait_for_timeout(2500)
            pg.mouse.click(600,330); pg.wait_for_timeout(2500)
            im=Image.open(io.BytesIO(pg.screenshot())).convert('RGB')
            im.quantize(128,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).save(f'{R}/og/{s}.png',optimize=True)
            print(s,os.path.getsize(f'{R}/og/{s}.png')//1024,'KB')
        except Exception as e: print(s,'FAILED',str(e)[:120])
        pg.close()
    b.close()
