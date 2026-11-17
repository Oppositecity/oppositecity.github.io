"""Fetch current orbital elements for the bodies EPHEMERIS reads, from the
public CelesTrak catalogue, and write ephemeris/elements.json.

  python3 scripts/ephemeris-elements.py

For each catalogue number in the page it records one of:
  elements   the latest published set (inclination, node, eccentricity,
             perigee, mean anomaly, mean motion and its drift, epoch)
  gone       the date the object reentered
  withheld   the object is up there and no elements are published
A body the catalogue cannot answer for is left out, and the page keeps the
figures it carries. If nothing at all can be fetched the file is not touched.
"""
import json, re, os, sys, time, datetime, subprocess
R=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
page=open(R+('/ephemeris-next' if os.path.exists(R+'/ephemeris-next/index.html') else '/ephemeris')+'/index.html').read()
ids=sorted(set(int(x) for x in re.findall(r'norad:(\d+)',page)))
def get(url):
    # curl, because a stock Python on a Mac often has no certificates to check with
    t=subprocess.run(['curl','-sS','-m','30','-A','static-site-build/1.0',url],capture_output=True,text=True,check=True).stdout
    try: return json.loads(t)
    except ValueError: return []
J2000=datetime.datetime(2000,1,1,12,tzinfo=datetime.timezone.utc)
out={}
for n in ids:
    try:
        g=get(f'https://celestrak.org/NORAD/elements/gp.php?CATNR={n}&FORMAT=json')
        if g:
            o=g[0]; ep=datetime.datetime.fromisoformat(o['EPOCH']).replace(tzinfo=datetime.timezone.utc)
            out[n]={'name':o['OBJECT_NAME'],'i':o['INCLINATION'],'raan':o['RA_OF_ASC_NODE'],'e':o['ECCENTRICITY'],
                    'argP':o['ARG_OF_PERICENTER'],'M0':o['MEAN_ANOMALY'],'n':o['MEAN_MOTION'],
                    'ndot':o.get('MEAN_MOTION_DOT',0),'epoch':round((ep-J2000).total_seconds()/86400,6)}
        else:
            s=get(f'https://celestrak.org/satcat/records.php?CATNR={n}&FORMAT=json')
            if s and s[0].get('DECAY_DATE'): out[n]={'name':s[0]['OBJECT_NAME'],'gone':s[0]['DECAY_DATE']}
            elif s: out[n]={'name':s[0]['OBJECT_NAME'],'withheld':True}
    except Exception as e: print(n,'failed:',e,file=sys.stderr)
    time.sleep(0.4)
if not any('epoch' in v for v in out.values()): sys.exit('nothing fetched; elements.json left as it was')
json.dump({'fetched':datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d'),'source':'CelesTrak','bodies':out},
          open(R+'/ephemeris/elements.json','w'),indent=0,separators=(',',':'))
for n,v in out.items(): print(n,v['name'],'gone '+v['gone'] if 'gone' in v else 'withheld' if 'withheld' in v else 'epoch %.2f'%v['epoch'])
