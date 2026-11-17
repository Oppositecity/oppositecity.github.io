# Opposite City: working notes for Claude Code

This repo is the live site at https://opposite.city (GitHub Pages, `main` branch).
Every push to `main` is a deploy. Read this file before changing anything.

## How to work here

- One fix per commit. Name the surface first: `room: desktop layout`.
- Before committing, serve the repo locally (`python3 -m http.server 8000`) and
  check the page at three sizes: phone portrait (390 wide), 13-inch laptop,
  wide desktop. Check with touch and with mouse and keyboard.
- Stop after each surface and say what changed in plain words. The owner looks
  at it on a phone and a laptop before the next one starts.
- Push only when the owner says so. If a pushed fix looks wrong live, revert
  that one commit; do not patch on top of it.
- Never put the owner's personal name in any page, file or commit message.
- Do not rewrite a piece's copy or concept. Fix what is asked.
- Pages caches hard. Tell the owner to check with `?v=2` on the URL.
- When a change alters how a piece behaves or what it shows, update its blurb
  and tags in `surfaces.json` and `registry-master.json` in the same change,
  so no blurb describes something the piece no longer does. Then resync
  `index.html` as described under Repo layout.
- Delegate simpler tasks (searches, mechanical edits, local checks) to
  subagents on Sonnet. Never delegate to Haiku. Use Fable only when it is
  needed: design, planning and hard problems.

## Two Claudes, one repo

Two Claudes work on this repo and cannot see each other's sessions: Claude
Code, here, with git; and Claude in chat, which has no local copy and writes
through the GitHub connector or the browser. These rules keep one from
overwriting the other's work.

- `main` is live. Nobody commits straight to `main`, the GitHub web editor
  included: every change arrives as a merged pull request, so each one is
  visible and can be reverted on its own.
- Claude in chat works on a branch named for the surface and the change
  (`ximeremix-hold`), and opens a pull request that says what changed and how
  it was tested. The owner develops and deploys from chat, so chat may merge
  its own pull request once the surface is not claimed and the branch is
  current with `main`. Otherwise Claude Code merges it after checking it, or
  the owner presses the merge button.
- Claiming a surface: when Claude Code starts on a surface, mark its fix-list
  item `[~]` in this file and commit that first. When chat opens a pull
  request, the surface counts as claimed until it is merged or closed. Neither
  Claude starts on a surface the other has claimed; ask the owner instead.
- At the start of every session, Claude Code lists open pull requests
  (`gh pr list`) and says which ones are waiting, before starting new work.
- Pull before starting any work. Pull again before pushing. If `main` moved,
  rebase on it and re-check every surface the change touches. Never
  force-push `main`.
- Before merging a pull request, check out its branch, serve it locally and
  look at the surface as described above. If it conflicts with `main`, resolve
  the conflict here; do not ask chat to resend whole files.
- A change to how a piece sounds or behaves goes to a preview first: a folder
  named `<slug>-next/`, unlisted (not in `surfaces.json`, the fallback list or
  `sitemap.xml`). The owner tries it at `https://opposite.city/<slug>-next/`.
  Once approved, copy it over `<slug>/index.html` in one commit and delete the
  `-next` folder in the same commit. Copy fixes and small layout fixes can
  skip the preview.
- Pieces with audio or heavy logic get a headless run before merging
  (Playwright with Chromium; install with `pip install playwright` then
  `playwright install chromium` if missing). Load the page over the local
  server, feed it a test file, read the console, and measure the output
  level. A page that throws an error or goes silent is not merged.
- Commits that come from chat end their message with `(from chat)`.
- When branch protection is turned on for `main` (require a pull request),
  Claude Code also works on a branch and merges its own pull request after
  the checks above.

## Repo layout

- `index.html`: the hub. Draws its grid from `surfaces.json`.
- `surfaces.json`: the published registry. Sections: words, sound, vision,
  atlas, band. A surface has one `district` and an optional `also` list for
  the other sections it sits in.
- One folder per surface, each with its own `index.html`.
- `registry-master.json`: the fuller list, including unpublished work.
- `venn/`: an unlisted experiment. Leave it alone unless asked.
- `poemstream/`: deliberately hidden from the hub, sitemap and search. Keep
  it hidden.

When `surfaces.json` changes, three other things must change with it:

1. the lean copy between `/* REGISTRY:BEGIN */` and `/* REGISTRY:END */` in
   `index.html` (same data, no blurbs)
2. the `<ul>` inside `#fallback` in `index.html`
3. `sitemap.xml`

## Design rules

### Fixed

- All text high contrast. Default to white on black. Supporting text is not
  dimmed to grey; if in doubt, brighter.
- Every mark carries meaning: a connection, a role, a status, a reference.
  Decoration, frames and colour that encode nothing are removed.
- Flat digital surfaces are fine, including Win95-style system chrome. No
  faux-physical textures.
- Text inputs get a visible box.
- Links are always clickable.
- No oxblood, cream or amber palette by default. Vary the palette per piece.

### Viewer first (new)

The piece adapts to the viewer's device, not the other way round.

- Layout, density and motion scale to the screen. Nothing clipped, nothing
  overlapping, no control out of reach.
- Touch, mouse and keyboard all work. No hover-only behaviour.
- Motion is calm by default and honours `prefers-reduced-motion`.
- Nothing rearranges unless the viewer caused it.

### Under revision (draft, ask before departing from the current state)

These were strict rules. The owner is reconsidering them. Until told
otherwise, keep each piece as it is and raise the question instead of
deciding it.

- Type: Courier Prime / Courier New is the house voice for the hub and the
  Words section. Atlas pieces already use their own faces. Sound and Vision
  pieces may take another face when it does a job Courier cannot.
- Layout: "words in space" (typographic, minimal, no rules or borders) is the
  default. Structure that encodes information is allowed.
- Per-section identity: sections may grow visibly distinct from each other so
  the site reads as several coherent bodies of work.

## Fix list, in working order

### 1. Small fixes to live pieces

- [x] `semantic-voyage/`: make flight and drift much slower. Stop the layout
  rearranging words around the viewer (the near-field correction toward
  measured distances). Words stay where they are.
  - [x] Revisit: a better way to tilt up and down. Today it is drag, or
    Shift + up/down on a keyboard; there is nothing on a phone besides drag.
    On a phone the view now also turns as the phone itself is tipped.
- [x] `apophasis/`: fix page margins and the spacing of the word field so
  alternatives do not crowd or collide, on phone and on laptop.
- [x] `room/`: desktop and laptop layout pass. It was built for a phone;
  make the measure, type size and controls sit properly on a wide screen.
  Became a rework at the owner's direction: no controls or text, driven by
  any activity, endless drift tethered to each spoken word.
- [x] `dof/`: make the full list view with bits per word the main view.
- [x] `pentimento/`: reconcile the laptop and phone layouts of the word field.
  One field on every device; the screen is a window scaled to the band's height.

### 2. Deploy backlog

- [ ] `aureole/`: the live page is still the old synonym-cloud build. The
  etymology rebuild was chosen and never deployed. Ask the owner for that
  build; do not reconstruct it. (Still waiting on the build.)
- [ ] Accursed Share: canonical build exists, never deployed. One figure
  (DRAM gross margin) is unverified and must be checked or cut first.
  (The build is not in this repo; waiting on it.)
- [ ] `clef/`: needs its text. (The owner's to write.)
- [~] Folklore classifiers (Thompson motif index, ATU tale types): the build
  of 2026-10-02 is in at `three-indexes/`, unlisted, on the `review` branch.
  Waiting on the owner's yes to publish.

### 3. Band and sound

- [x] `shellac/`: add a clip control that sends a chosen stretch of a record
  to `clipper/`, which already hands off to `ximeremix/`.
- [x] A proper Band section page: the takes, the remix page, how to take a
  take apart and repost it. At `/band/`, linked from the hub's Band heading.
  WAKE is listed under Band and on that page. `/take/` only forwards a take
  to the remix page, so it is not listed.

- [~] `idiophone/`: a more playable interface and easier playback: a real
  keyboard (touch slides, computer keys), objects that stay between visits,
  play without the microphone, and a recording that can go to `ximeremix/`.
  Preview in `idiophone-next/`.

### 4. Shared code, then new work

- [x] After the fixes in part 1, pull out whatever device-handling code
  actually repeated (input, viewport, motion) into one shared file. Do not
  build it ahead of the evidence.
  Checked 2026-11-11 across the five part 1 pieces: only the one-line
  reduced-motion query and safe-area CSS repeat; input handling differs in
  every piece. Not worth a shared file yet. Look again after more work.
- [x] New piece: floating language drawn from Wikipedia articles, clouding
  around the subject each describes. First build at `/nimbus/` (working
  title). Published to the hub under Words, 2026-11-11.

### 5. XIMEREMIX opens up

The brief is `ximeremix/BRIEF.md`. Read it before starting. One phase at a
time, in `ximeremix-next/`, stopping for the owner after each.

- [x] Phase 0: find out what plyr.fm allows from another site. No code shipped.
  Answered 2026-11-16 in `ximeremix/PHASE0.md`: everything needed works from
  another site. Three decisions there wait on the owner before phase 1.
- [ ] Phase 1: plyr tracks as a source, opt-in only.
- [ ] Phase 2: remixes of sources with no original post, and a lineage record.
- [ ] Phase 3: publish a remix to plyr, by a deliberate button.
- [ ] Phase 4: show where a sound came from and what was made from it.

### 6. Audit of 2026-11-16

Every page was loaded at phone, laptop and wide sizes with `scripts/sweep.py`
and looked at. The work sits on the branch `review`, one commit per surface,
not pushed. The owner looks at it, then says which commits go live.

Done on `review`

- [x] `sitemap.xml` was missing `language-instrument/`. `scripts/check.sh` now
  fails when the registry, the hub's copies and the sitemap disagree.
- [x] `syllababbler/`: dark ground across the whole wide screen.
- [x] `semantic-voyage/`: the loading line no longer runs past 100%.
- [x] Text contrast: `dof/`, `split/`, `sortition-congress/`, `circlefornia/`.
- [x] `signgularity/`: control rows wrap on a phone.
- [x] `lode/`: instructions wrap on a phone.
- [x] `shellac/`: the record holds still under reduced motion.
- [x] `sator/`: `stats.json` rebuilt by `scripts/sator-census.py`. The count
  agrees with every uncapped list of examples the page already carried.
- [x] A description and share tags on the 29 published pages that lacked
  them, each taken from the piece's own blurb.
- [x] `registry-master.json`: the 11 published pieces it lacked, and the 7 in
  the yard. Their sections and finish scores there are Claude Code's guess.
- [x] `three-indexes/` and `fall/`: finished builds found in the owner's
  Downloads folder, brought in unlisted. The folklore pipeline that builds
  THREE INDEXES stays outside this repo (`~/Downloads/folkfiles`).
- [x] `/yard/`: one unlisted page listing everything built and not published.
  Keep it current when a piece enters or leaves.
- [x] `idiophone-next/`: publishing signs in at the account's own server and
  reports a refused record with the server's reason.

Looked at and left alone, with the reason

- `agentic-entropy/` and `clef/` open zoomed in on a phone on purpose: the
  whole chart would be unreadable. "Whole chart" is one tap away.
- `kelp/`: its text colours were measured when it was made (see its CSS).
- `descent/`, `pentimento/`, `clipper/` sit left on a wide screen. That is a
  layout choice under revision; the owner's call.
- `chip/`: its preset row scrolls sideways as a tape, with the next one
  showing at the edge.
- Small touch targets in `nimbus/`, `shellac/`, `kelp/`, `bz/`: needs a hand
  on a real phone before changing anything.

Still open

- [ ] `ximeremix/`: the band handle `rainwatchbaseball.bsky.social` no longer
  resolves, so every load logs a failed request. Takes still arrive by account
  id. Fix inside part 5, which holds the page. It also has no share tags.
- [ ] `idiophone/`: its records hold decimals, which atproto may refuse. Test
  publishing with a real account before the preview replaces the live page.
- [ ] `registry-master.json` still carries older names for pieces now live
  (figure-ground-type is `split/`, slop-flag is `slopflag/`,
  musical-time-clock looks like `polyrhythm/`). The owner says which to drop.
- [ ] One shared atproto sign-in for `idiophone/`, `ximeremix/`,
  `remix/give/` and `slopflag/`. Part 5 needs it too.
- [ ] One shared "record what you hear, take it to XIMEREMIX" for `kelp/`,
  `polyrhythm/`, `language-instrument/` and `chip/`. `idiophone-next/` has it.
- [ ] Merged remote branches can be deleted.
- [ ] `venn/` fails `scripts/check.sh` (no CSP tag). It is marked leave alone.

Not found anywhere on this machine or in the account's repositories

- The `aureole/` etymology rebuild, Accursed Share, and these pieces the
  master list calls live: text-temperature, drone-clock, guitar-tuner,
  datamosh, glitch-word-processor, pixel-converter, organology-organ,
  top-chicken, bartlebluesky, lexicon-devil, the-receipt, n-10-122.
- Found but not brought in: `semantic-distance.html` (an early form of
  `room/`), a Lombardi tool that needs a local server, and source for heir
  and a slop congress that are not web pages.

### 7. Next, planned and not started

Each is a preview in a `-next` folder, listed on `/yard/`, one at a time.

- [~] `pentimento-next/`: clearer on a phone, same concept and intro copy.
  Built and live as a preview 2026-11-16, brightness change included at the
  owner's yes. Waiting on the owner's look before it replaces `pentimento/`.
  Seen at 390 wide on 2026-11-16: the ladder of layers sits on top of the
  words; the top line reads "a 42% · 63.2 words still in play" as if "a"
  began a sentence; the likeliest word is small and buried because size
  means nearness; the hint vanishes after the first tap; the 523 MB download
  is only in small print. Plan: give the ladder its own strip on a narrow
  screen and drop its number column there; quote the likeliest word in the
  top line and round the count; open each new field turned so the likeliest
  word is in the middle; say the download size on the begin button. Raising
  the brightness of unlikely words changes the look, so ask the owner first.
  Headless: load, begin, wait for "model ready" (about 90 s), tap a word.
- [ ] `idiophone/`: when the owner approves the preview, publish once with a
  real account to settle the decimals question, then copy `idiophone-next/`
  over it, delete the preview, and update the blurb and tags in both
  registries (keyboard, hold to bow, objects kept, recording, hand-off) and
  remove it from `/yard/`.
- [ ] Shared atproto sign-in, `/shared/atproto.js`: resolve a handle, find the
  account's own server, sign in with an app password, write a record, upload
  a blob. Take it from `ximeremix/` (`signInS`, `pdsFor`, `entryway`,
  `callS`, `callBin`), which is the fullest. Move `idiophone-next/` to it
  first as the test, then `remix/give/`, then `ximeremix-next/` in phase 1.
- [ ] `idiophone/` reader: type a handle, list that account's
  `city.opposite.idiophone.capture` records with `listRecords` (public, no
  sign-in), and put any of them under the keys. Builds on the import that
  `idiophone-next/` already has.
- [ ] XIMEREMIX phase 1, after the owner answers `ximeremix/PHASE0.md`.
- [ ] Yard pieces the owner says yes to: add to `surfaces.json` with a blurb
  the owner approves, resync the hub, the fallback list and the sitemap, and
  take them off `/yard/`. `scripts/check.sh` confirms the sync.

### Later, only if needed

- A front door showing the strongest handful of pieces in plain words.
  A draft is on the `front-door` branch at `/door/`, not on main; the owner
  picks the pieces.
- Subdomains, a private repo for internal tools, a locked backroom.

## Open questions for the owner

- The Venn view did not match what was pictured. What should it look like?
- `somesets/` and `bz/`: rework, fold into Vision, or retire? bz now also
  lives inside WAKE (every other variation); its own page is still up.
