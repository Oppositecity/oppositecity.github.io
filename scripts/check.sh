#!/usr/bin/env bash
# Site hygiene checks. Run from the repo root: scripts/check.sh
set -u
fail=0
bad() { echo "FAIL: $1"; fail=1; }
while IFS= read -r f; do
  grep -qiE '<html[^>]*\blang=' "$f"            || bad "$f: no lang attribute"
  grep -qi 'name="viewport"' "$f"                || bad "$f: no viewport meta"
  grep -qi 'http-equiv="Content-Security-Policy"' "$f" || bad "$f: no CSP meta"
  grep -qE 'fonts\.(googleapis|gstatic)\.com' "$f" && bad "$f: uses Google Fonts (self-host in /fonts)"
  # remote <script src> must carry integrity (module imports can't; keep those pinned to exact versions)
  grep -oE '<script[^>]+src="https?://[^"]+"[^>]*>' "$f" | grep -v 'integrity=' | grep -v 'youtube.com/iframe_api' | sed "s|^|FAIL: $f: remote script without integrity: |" | grep . && fail=1
  grep -oE "import\(['\"]https://[^'\"]+" "$f" | grep -vE '@[0-9]+\.[0-9]+\.[0-9]+' | sed "s|^|FAIL: $f: unpinned remote import: |" | grep . && fail=1
done < <(find . -name '*.html' -not -path './.git/*' -not -path '*/vendor/*' -not -path './lode/android/*')
for f in og.png favicon.svg favicon.ico 404.html robots.txt sitemap.xml .well-known/security.txt privacy.html .nojekyll; do
  [ -e "$f" ] || bad "missing $f"
done
# The registry is copied by hand into three other places. They must agree.
python3 - <<'PY' || fail=1
import json, os, re, sys
bad = 0
def no(m):
    global bad; print("FAIL: registry: " + m); bad = 1
def rows(d): return [x for v in d.values() if isinstance(v, list) for x in v if isinstance(x, dict) and "slug" in x]
S = rows(json.load(open("surfaces.json")))
h = open("index.html").read()
m = re.search(r"/\* REGISTRY:BEGIN \*/(.*?)/\* REGISTRY:END \*/", h, re.S)
L = rows(json.loads(re.search(r"\{.*\}", m.group(1), re.S).group(0))) if m else []
if not L: no("no lean copy found in index.html")
ls = {x["slug"]: x for x in L}
for x in S:
    y = ls.pop(x["slug"], None)
    if y is None: no("%s is missing from the lean copy in index.html" % x["slug"]); continue
    d = sorted(k for k in set(x) | set(y) if k != "blurb" and x.get(k) != y.get(k))
    if d: no("%s differs in the lean copy: %s" % (x["slug"], ", ".join(d)))
    u = x.get("url", "").replace("https://opposite.city/", "")
    if not os.path.exists(os.path.join(u, "index.html")): no("%s points at %s, which has no page" % (x["slug"], x.get("url")))
for k in ls: no("%s is in the lean copy but not in surfaces.json" % k)
fb = re.search(r'id="fallback".*?</ul>', h, re.S)
fbu = set(re.findall(r'href="([^"]+)"', fb.group(0))) if fb else set()
sm = set(re.findall(r"<loc>([^<]+)</loc>", open("sitemap.xml").read()))
for x in S:
    if x.get("url") not in fbu: no("%s is missing from the fallback list" % x["slug"])
    if x.get("url") not in sm: no("%s is missing from sitemap.xml" % x["slug"])
for u in fbu - {x.get("url") for x in S}: no("fallback list has %s, which is not in surfaces.json" % u)
for u in sm:
    if "poemstream" in u or "-next/" in u: no("sitemap.xml lists %s, which must stay hidden" % u)
sys.exit(bad)
PY
exit $fail
