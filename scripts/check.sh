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
done < <(find . -name '*.html' -not -path './.git/*' -not -path '*/vendor/*')
for f in og.png favicon.svg favicon.ico 404.html robots.txt sitemap.xml .well-known/security.txt privacy.html .nojekyll; do
  [ -e "$f" ] || bad "missing $f"
done
exit $fail
