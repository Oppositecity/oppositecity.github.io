#!/usr/bin/env python3
"""Slop Flag invites: every few days, open a new room with a generated outline and a seed loop,
and post the call on Delvetown.

No neural anything. The outline is dice and word lists, seeded by the date, so any call can be
regenerated exactly. Standard library only.

  python invite.py                 # dry run: prints what it would post
  python invite.py --date 2026-10-19
  SF_LIVE=1 python invite.py       # actually posts (needs SF_HANDLE, SF_APP_PASSWORD)
  python invite.py --force         # ignore the skip dice and the quiet-room check

Env: SF_HANDLE, SF_APP_PASSWORD, SF_PDS (default https://pds.delve.town),
     SF_STUDIO, SF_INDEX (default constellation), SF_STUDIO_URL, SF_LIVE=1 to post.
"""
import argparse, datetime as dt, hashlib, json, os, random, sys, time, urllib.parse, urllib.request

NS = 'city.opposite.slopflag'
TOWN_POST = 'town.delve.feed.post'
PDS = os.environ.get('SF_PDS', 'https://pds.delve.town').rstrip('/')
INDEX = os.environ.get('SF_INDEX', 'https://constellation.microcosm.blue').rstrip('/')
STUDIO = os.environ.get('SF_STUDIO', 'at://did:plc:zqnqyt6bn4a5lasbe7pfln6y/city.opposite.slopflag.studio/self')
STUDIO_URL = os.environ.get('SF_STUDIO_URL', 'https://opposite.city/slopflag/')
LIVE = os.environ.get('SF_LIVE') == '1'
POST_LIMIT = 300          # graphemes; town posts are assumed to share Bluesky's limit
ROOM_DAYS = 14            # rooms close themselves after this
QUIET_DAYS = 5            # a room younger than this with fewer than QUIET_PARTS outside parts gets a nudge instead
QUIET_PARTS = 2

# ------------------------------------------------------------------ outline: dice and word lists
ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
MODES = ['minor', 'dorian', 'phrygian', 'mixolydian', 'lydian', 'major', 'minor pentatonic', 'major pentatonic']
FORMS = [('open', 4), ('relay', 2), ('call-response', 3)]          # reduce only makes sense once a room is full
FORM_SAY = {'open': 'open', 'relay': 'relay', 'call-response': 'trading'}
TITLE_A = ['tin', 'low', 'salt', 'night', 'paper', 'copper', 'slow', 'glass', 'static', 'loose', 'damp', 'neon',
           'soft', 'iron', 'pale', 'late', 'hollow', 'wire', 'chalk', 'dust']
TITLE_B = ['weather', 'ferry', 'stairwell', 'parade', 'harbor', 'signal', 'orchard', 'tower', 'garage', 'tide',
           'carousel', 'alley', 'antenna', 'kiln', 'ledger', 'choir', 'lantern', 'switchyard', 'motel', 'reef']
TEXTURE = ['dry and close', 'wet and far off', 'dusty', 'bright and brittle', 'warm and blurry', 'thin and wiry',
           'heavy at the bottom', 'all air', 'grainy', 'clean and small']
MOTION = ['circling', 'leaning forward', 'stumbling on purpose', 'breathing slowly', 'stopping and starting',
          'drifting sideways', 'locked tight', 'falling apart by the end', 'swelling then gone', 'patient']
SECTIONS = {8: [['air', 'full'], ['build', 'drop'], ['loop', 'loop'], ['in', 'out']],
            12: [['air', 'build', 'full'], ['full', 'strip back', 'full'], ['call', 'answer', 'both']],
            16: [['air', 'build', 'full', 'strip back'], ['in', 'full', 'break', 'full'], ['slow', 'slow', 'push', 'out']]}

def sm(mode):  # mini-notation splits on spaces, so two-word scales take colons
    return mode.replace(' ', ':')

def tonic(root, octave):
    return f'{root.lower()}{octave}'

# Each seed claims one register and leaves the rest open. They use only built-in sounds.
def seed_drone(r, root, mode):
    return 'pad', 'low and mid', (f'note("<{tonic(root,2)} {tonic(root,3)}>").s("{r.choice(["sawtooth","supersaw","triangle"])}")'
            f'.lpf(sine.range(300, {r.choice([900,1400,2000])}).slow(8)).attack(1).release(2)'
            f'.room(.5).gain(.35)'), ['highs', 'rhythm']
def seed_kick(r, root, mode):
    k, n = r.choice([(3, 8), (5, 8), (4, 8), (5, 16), (7, 16)])
    return 'kick', 'low', f's("sbd({k},{n})").note("{tonic(root,1)}").decay({r.choice([.3,.5,.7])}).gain(.8)', ['bass line', 'mids', 'highs']
def seed_hats(r, root, mode):
    pat = r.choice(['hh*8', '[~ hh]*4', 'hh(5,8)', 'hh*16?', '<hh*4 hh*8>'])
    return 'hats', 'high', f's("{pat}").gain(perlin.range(.25, .6)).pan(sine.slow(3))', ['low end', 'harmony']
def seed_bass(r, root, mode):
    degs = r.choice(['0 ~ 0 4', '0 0 ~ 2', '<0 -3> ~ 4 ~', '0 ~ ~ 0 ~ 2 ~ ~', '0 7 0 ~'])
    return 'bass', 'low', (f'n("{degs}").scale("{root}2:{sm(mode)}").s("{r.choice(["sawtooth","square","pulse"])}")'
            f'.lpf({r.choice([400,600,900])}).lpenv(2).decay(.2).sustain(.3).gain(.6)'), ['drums', 'highs']
def seed_arp(r, root, mode):
    return 'arp', 'mid-high', (f'n("0 2 4 <6 7>").scale("{root}4:{sm(mode)}").s("triangle").fast({r.choice([1,2])})'
            f'.delay(.4).delaytime(.375).delayfeedback(.35).gain(.35)'), ['low end', 'rhythm']
def seed_bell(r, root, mode):
    return 'bells', 'high', (f'n("<0 4 [2 6] ~>").scale("{root}5:{sm(mode)}").s("sine").fmi({r.choice([2,3,5])})'
            f'.fmh({r.choice([1.41, 2.01, 3.5])}).decay(.6).sustain(0).room(.6).gain(.3)'), ['low end', 'groove']
SEEDS = [seed_drone, seed_kick, seed_hats, seed_bass, seed_arp, seed_bell]

def outline(date):
    r = random.Random(hashlib.sha256(f'slopflag-{date.isoformat()}'.encode()).hexdigest())
    root, mode = r.choice(ROOTS), r.choice(MODES)
    bars = r.choice([8, 12, 16, 16])
    form = r.choices([f for f, _ in FORMS], [w for _, w in FORMS])[0]
    sections = r.choice(SECTIONS[bars]); per = bars // len(sections)
    smap = ', '.join(f'{i*per+1}-{(i+1)*per} {s}' for i, s in enumerate(sections))
    lane, register, code, open_regs = r.choice(SEEDS)(r, root, mode)
    return {
        'title': f'{r.choice(TITLE_A)} {r.choice(TITLE_B)}'.title(),
        'bpm': r.randrange(68, 134, 2), 'key': f'{root} {mode}', 'bars': bars, 'form': form,
        'direction': f'{r.choice(TEXTURE)}, {r.choice(MOTION)}',
        'map': smap, 'seed': {'lane': lane, 'register': register, 'code': code}, 'open': open_regs,
        'skip': r.random() < 0.25,   # semi-regular: about one scheduled call in four doesn't happen
    }

def brief(o):
    return (f"Direction: {o['direction']}. Map: {o['map']}. "
            f"The {o['seed']['lane']} is already going in the {o['seed']['register']}; "
            f"{' and '.join(o['open'])} are open. This is a sketch, not a chart: bend it.")

def graphemes(s):  # close enough for a guard: no combining marks in what we write
    return len(s)

def call_text(o, room_link):
    head = f"Room open: {o['title']}. {o['bpm']} bpm, {o['key']}, {o['bars']} bars, {FORM_SAY[o['form']]}."
    body = f" {o['direction'].capitalize()}. {o['seed']['lane'].capitalize()} is going; {' and '.join(o['open'])} open."
    tail = " Sit in: reply with lane: strudel code."
    for link in (f' Hear it: {room_link}', f' Hear it: {STUDIO_URL}', ''):
        t = head + body + tail + link
        if graphemes(t) <= POST_LIMIT: return t
    return (head + tail)[:POST_LIMIT]

def nudge_text(o_title):
    return f"{o_title} is still waiting on a second player. The seed loop is going and most of the room is open. One line is enough."

# ------------------------------------------------------------------ atproto (just the calls we need)
def http(method, url, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None: req.add_header('Content-Type', 'application/json')
    if token: req.add_header('Authorization', f'Bearer {token}')
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read() or b'{}')

def xrpc_get(name, **q): return http('GET', f'{PDS}/xrpc/{name}?{urllib.parse.urlencode(q)}')
B32 = '234567abcdefghijklmnopqrstuvwxyz'
def tid():
    n = (int(time.time() * 1_000_000) << 10) | random.getrandbits(10)
    return ''.join(B32[(n >> (5 * i)) & 31] for i in range(12, -1, -1))

def backlink_count(target, coll, path):
    try:
        q = urllib.parse.urlencode({'target': target, 'collection': coll, 'path': path, 'limit': 100})
        b = http('GET', f'{INDEX}/links?{q}')
        return b.get('linking_records') or b.get('records') or []
    except Exception as e:
        print(f'  (index did not answer: {e})'); return None

def quiet_room(sess):
    """Newest band room, if it is young and nobody else has played in it yet."""
    recs = xrpc_get('com.atproto.repo.listRecords', repo=sess['did'], collection=f'{NS}.project', limit=20).get('records', [])
    recs = [r for r in recs if r['value'].get('form') != 'lobby' and r['value'].get('anchor')]
    if not recs: return None
    newest = max(recs, key=lambda r: r['value'].get('createdAt', ''))
    age = dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(newest['value']['createdAt'].replace('Z', '+00:00'))
    if age.days >= QUIET_DAYS: return None
    replies = backlink_count(newest['value']['anchor']['uri'], TOWN_POST, '.reply.root.uri')
    if replies is None: return None
    outside = [x for x in replies if (x.get('did') or x.get('uri', 'at:///').split('/')[2]) != sess['did']]
    band_replies = len(replies) - len(outside)
    if len(outside) >= QUIET_PARTS or band_replies >= 1: return None   # busy enough, or already nudged once
    return newest

# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--date'); ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    date = dt.date.fromisoformat(a.date) if a.date else dt.datetime.now(dt.timezone.utc).date()
    o = outline(date)
    print(json.dumps(o, indent=2))
    if o['skip'] and not a.force:
        print('Dice say skip this one. (--force to post anyway)'); return

    if not LIVE:
        rkey = 'DRYRUN'
        print('\n--- would post ---\n' + call_text(o, f"{STUDIO_URL}?project=at://BAND/{NS}.project/{rkey}"))
        print('\n--- room brief ---\n' + brief(o))
        print('\nDry run. Set SF_LIVE=1 to post.'); return

    sess = http('POST', f'{PDS}/xrpc/com.atproto.server.createSession',
                {'identifier': os.environ['SF_HANDLE'], 'password': os.environ['SF_APP_PASSWORD']})
    tok, did = sess['accessJwt'], sess['did']
    def put(coll, rec, rkey=None):
        rec = {'$type': coll, **rec}
        if rkey: return http('POST', f'{PDS}/xrpc/com.atproto.repo.putRecord', {'repo': did, 'collection': coll, 'rkey': rkey, 'record': rec}, tok)
        return http('POST', f'{PDS}/xrpc/com.atproto.repo.createRecord', {'repo': did, 'collection': coll, 'record': rec}, tok)
    now = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%fZ')

    q = None if a.force else quiet_room(sess)
    if q:
        anchor = q['value']['anchor']
        t = nudge_text(q['value']['title'])
        put(TOWN_POST, {'text': t, 'reply': {'root': anchor, 'parent': anchor}, 'createdAt': now})
        print(f"Room {q['value']['title']} is still quiet; nudged its thread instead of opening a new one."); return

    studio = xrpc_get('com.atproto.repo.getRecord', **dict(zip(['repo', 'collection', 'rkey'], STUDIO[5:].split('/'))))
    prkey = tid(); puri = f'at://{did}/{NS}.project/{prkey}'
    post = put(TOWN_POST, {'text': call_text(o, f'{STUDIO_URL}?project={puri}'), 'createdAt': now})
    closes = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=ROOM_DAYS)).strftime('%Y-%m-%dT%H:%M:%SZ')
    proj = put(f'{NS}.project', {
        'studio': {'uri': studio['uri'], 'cid': studio['cid']}, 'title': o['title'], 'bpm': o['bpm'], 'bars': o['bars'],
        'meter': '4/4', 'key': o['key'], 'form': o['form'], 'status': 'open', 'openUntil': closes,
        'brief': brief(o), 'anchor': {'uri': post['uri'], 'cid': post['cid']}, 'createdAt': now}, prkey)
    put(f'{NS}.clip', {'project': {'uri': proj['uri'], 'cid': proj['cid']}, 'kind': 'strudel',
                       'lane': o['seed']['lane'], 'code': o['seed']['code'], 'createdAt': now})
    print(f"Opened {proj['uri']}\nCall: {post['uri']}")

if __name__ == '__main__':
    try: main()
    except urllib.error.HTTPError as e:
        print(f'{e.code} {e.reason}: {e.read()[:300]!r}', file=sys.stderr); sys.exit(1)
