#!/usr/bin/env python3
"""Rebuild sator/stats.json from the word lists in sator/lang/.

A sator square is an N by N grid of letters in which every row is a word, the
grid reads the same along rows and columns, and it is its own half-turn. So
row N-1-i is row i reversed, and only the top half is free.

For each language and size this counts: n, the words on the list; rev, the
words whose reversal is also on the list; sq, the squares.

Run from the repo root: python3 scripts/sator-census.py
"""
import json, os, glob
from collections import defaultdict

def count(words, N, limit=None):
    ws = set(words)
    rev = [w for w in words if w[::-1] in ws]
    h = (N + 1) // 2
    pre = defaultdict(list)                      # reversible words by prefix
    for w in rev:
        for k in range(N + 1): pre[w[:k]].append(w)
    total = 0
    g = [[None] * N for _ in range(N)]
    def place(i, w):
        """Write row i and its mirror row; return the cells set, or None on a clash."""
        done = []
        for r, word in ((i, w), (N - 1 - i, w[::-1])):
            for j, c in enumerate(word):
                for a, b in ((r, j), (j, r)):
                    if g[a][b] is None: g[a][b] = c; done.append((a, b))
                    elif g[a][b] != c:
                        for x, y in done: g[x][y] = None
                        return None
        return done
    def go(i):
        nonlocal total
        if i == h:
            total += 1; return
        p = ''
        for j in range(N):
            if g[i][j] is None: break
            p += g[i][j]
        middle = (N % 2 == 1 and i == h - 1)
        # the middle row of an odd square is its own mirror: any palindrome on the list
        cands = [w for w in ws if w.startswith(p) and w == w[::-1]] if middle else pre.get(p, ())
        for w in cands:
            d = place(i, w)
            if d is None: continue
            go(i + 1)
            for x, y in d: g[x][y] = None
    go(0)
    return len(words), len(rev), total

def main():
    root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'sator')
    out = {}
    for f in sorted(glob.glob(os.path.join(root, 'lang', '*.js'))):
        lang = os.path.basename(f)[:-3]
        s = open(f, encoding='utf-8').read()
        d = json.loads(s[s.index('=') + 1:].rstrip().rstrip(';'))
        out[lang] = {'stat': {}}
        for n, blob in sorted(d['words'].items()):
            N = int(n)
            words = sorted({blob[i:i + N] for i in range(0, len(blob) - N + 1, N)})
            nw, rv, sq = count(words, N)
            out[lang]['stat'][n] = {'n': nw, 'rev': rv, 'sq': sq}
            sols = d.get('sol', {}).get(n, [])
            ok = all(len(x) == N * N for x in sols)
            print(f'{lang:9} {N}x{N}  words {nw:6}  reversible {rv:5}  squares {sq:9}  (page carries {len(sols)} examples{"" if ok else ", malformed"})')
    json.dump(out, open(os.path.join(root, 'stats.json'), 'w'), separators=(',', ':'))
    print('wrote sator/stats.json')

if __name__ == '__main__':
    main()
