"""Load every page in the repo at phone, laptop and wide sizes and report what
is measurably wrong: console errors, failed requests, sideways scroll, controls
off the screen, dim or tiny text, small touch targets, missing share tags.

  python3 -m http.server 8000          # from the repo root, in another shell
  python3 scripts/sweep.py [out-dir]   # needs: pip install playwright; playwright install chromium

Writes sweep.json and screenshots to out-dir (default /tmp/sweep). It measures;
it does not judge. Look at the screenshots too.

Headless Chromium's fake microphone does not open here. To test a piece that
listens, replace navigator.mediaDevices.getUserMedia in an init script with one
that returns the stream of a MediaStreamAudioDestinationNode fed by a test tone.
"""
import sys, os, json, re
from playwright.sync_api import sync_playwright
R=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S=sys.argv[1] if len(sys.argv)>1 else '/tmp/sweep'
os.makedirs(S+'/shots',exist_ok=True)
dirs=sorted(d for d in os.listdir(R) if os.path.exists(f'{R}/{d}/index.html'))
subs=[]
for d in dirs:
    for e in sorted(os.listdir(f'{R}/{d}')):
        if os.path.exists(f'{R}/{d}/{e}/index.html') and e not in('android','vendor'): subs.append(f'{d}/{e}')
pages=['']+dirs+subs
JS=r"""()=>{
 const lum=c=>{const m=c.match(/[\d.]+/g).map(Number);const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return [.2126*f(m[0])+.7152*f(m[1])+.0722*f(m[2]),m.length>3?m[3]:1]};
 const bgOf=e=>{for(;e;e=e.parentElement){const b=getComputedStyle(e).backgroundColor;const m=b.match(/[\d.]+/g);if(m&&(m.length<4||+m[3]>.5))return b;}return 'rgb(255,255,255)'};
 const vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&+s.opacity>0};
 const out={hscroll:document.documentElement.scrollWidth-innerWidth,dim:[],tiny:[],off:[],small:0,inter:0,canvas:document.querySelectorAll('canvas').length,textlen:document.body.innerText.trim().length,title:document.title,desc:!!document.querySelector('meta[name=description]'),og:!!document.querySelector('meta[property="og:title"]'),h:document.documentElement.scrollHeight};
 const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const seen=new Set();
 for(let n;n=w.nextNode();){const t=n.textContent.trim();if(t.length<2)continue;const e=n.parentElement;if(!e||seen.has(e)||!vis(e)||['SCRIPT','STYLE','NOSCRIPT'].includes(e.tagName))continue;seen.add(e);
  const s=getComputedStyle(e);const [l,a]=lum(s.color);const [b]=lum(bgOf(e));const eff=l*a+b*(1-a);const op=(()=>{let o=1;for(let x=e;x;x=x.parentElement)o*=+getComputedStyle(x).opacity;return o})();
  const l2=eff*op+b*(1-op);const cr=(Math.max(l2,b)+.05)/(Math.min(l2,b)+.05);
  if(cr<7)out.dim.push(cr.toFixed(1)+' '+t.slice(0,28));
  if(parseFloat(s.fontSize)<11.5)out.tiny.push(parseFloat(s.fontSize)+' '+t.slice(0,24));}
 for(const e of document.querySelectorAll('a[href],button,input,select,textarea,[role=button],[onclick]')){if(!vis(e))continue;out.inter++;const r=e.getBoundingClientRect();
  if(r.right>innerWidth+2||r.left<-2)out.off.push((e.textContent||e.id||e.tagName).trim().slice(0,20));
  if(Math.min(r.width,r.height)<30&&e.type!=='hidden')out.small++;}
 out.dimN=out.dim.length;out.dim=out.dim.slice(0,5);out.tinyN=out.tiny.length;out.tiny=out.tiny.slice(0,4);out.off=out.off.slice(0,5);
 return out;}"""
VP={'phone':dict(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,device_scale_factor=1),'laptop':dict(viewport={'width':1280,'height':800}),'wide':dict(viewport={'width':1920,'height':1080})}
res={}
with sync_playwright() as p:
    b=p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required','--use-gl=swiftshader'])
    for name,kw in VP.items():
        c=b.new_context(**kw)
        for pgname in pages:
            key=pgname or '(hub)'; r=res.setdefault(key,{})
            pg=c.new_page(); errs=[]; fails=[]
            pg.on('console',lambda m,errs=errs: errs.append(m.text[:140]) if m.type=='error' else None)
            pg.on('pageerror',lambda e,errs=errs: errs.append('PAGEERROR '+str(e)[:140]))
            pg.on('requestfailed',lambda q,fails=fails: fails.append(q.url[:90]))
            pg.on('response',lambda q,fails=fails: fails.append(str(q.status)+' '+q.url[:90]) if q.status>=400 else None)
            try:
                pg.goto(f'http://localhost:8000/{pgname}/' if pgname else 'http://localhost:8000/',wait_until='load',timeout=20000)
                pg.wait_for_timeout(1800)
                m=pg.evaluate(JS); m['url']=pg.url.replace('http://localhost:8000','')
                if name!='wide': pg.screenshot(path=f"{S}/shots/{key.replace('/','_')}.{name}.png")
            except Exception as e: m={'EXC':str(e)[:160]}
            m['errs']=list(dict.fromkeys(errs))[:4]; m['fails']=list(dict.fromkeys(fails))[:4]
            r[name]=m; pg.close()
        c.close()
    b.close()
# static
for key in res:
    f=f"{R}/{'' if key=='(hub)' else key+'/'}index.html"; src=open(f,errors='ignore').read()
    res[key]['static']={'bytes':len(src),'reduced':'prefers-reduced-motion' in src,'hover':len(re.findall(r':hover',src)),'mouse':len(re.findall(r"mouse(down|move|up)",src)),'pointer':len(re.findall(r"pointer(down|move|up)",src)),'touch':len(re.findall(r"touch(start|move|end)",src)),'keydown':'keydown' in src or 'keyup' in src,'raf':'requestAnimationFrame' in src,'audio':'AudioContext' in src,'ext':sorted(set(re.findall(r'https?://([a-z0-9.-]+)',src))-{'opposite.city','www.w3.org'})[:8]}
json.dump(res,open(S+'/sweep.json','w'),indent=1)
print(len(res),'pages')
