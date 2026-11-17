"""Count how many Wikipedia articles each word turns up in, over a sample of
the openings of random articles, and print the words that turn up in the
most. NIMBUS carries the list so it can tell a word that belongs to its
subject from one that any article might use.

  python3 scripts/nimbus-common.py [requests=90] /tmp/common.json

Twenty openings a request, one request every five seconds (it allows about ten in forty), and it waits when
Wikipedia says slow down. The file is rewritten every ten requests, so a run
cut short still leaves a list. Openings under 300 characters are skipped.
"""
import sys, json, re, subprocess, collections, time
N=int(sys.argv[1]) if len(sys.argv)>1 else 90
OUT=sys.argv[2] if len(sys.argv)>2 else '/tmp/common.json'
URL=('https://en.wikipedia.org/w/api.php?format=json&formatversion=2&action=query&generator=random'
     '&grnnamespace=0&grnlimit=20&prop=extracts&exintro=1&explaintext=1&exlimit=20')
def get():
    # curl, because a stock Python on a Mac often has no certificates to check with
    t=subprocess.run(['curl','-sS','-m','30','-A','nimbus-wordlist/1.0 (static site build script)',URL],capture_output=True,text=True).stdout
    try: return json.loads(t)['query']['pages']
    except Exception: return None
df=collections.Counter(); got=0; wait=5
def dump():
    out={w:round(c/got,4) for w,c in df.most_common() if c>=max(3,got*0.004)}
    json.dump({'articles':got,'share':out},open(OUT,'w'))
for k in range(N):
    ps=get()
    if ps is None:
        wait=min(120,wait*2); print('slow down; waiting',wait,file=sys.stderr); time.sleep(wait); continue
    wait=5
    for p in ps:
        t=p.get('extract','')
        if len(t)<300: continue
        got+=1
        df.update(set(w.lower().rstrip("'-") for w in re.findall(r"[A-Za-z][A-Za-z'-]{3,}",t)))
    print(k+1,'requests',got,'articles',file=sys.stderr); time.sleep(5)
    if k%10==9: dump()
dump()
