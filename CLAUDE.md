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
- [ ] Folklore classifiers (Thompson motif index, ATU tale types): finish and
  deploy. Ask for the current builds. (Not in this repo; waiting on them.)

### 3. Band and sound

- [x] `shellac/`: add a clip control that sends a chosen stretch of a record
  to `clipper/`, which already hands off to `ximeremix/`.
- [x] A proper Band section page: the takes, the remix page, how to take a
  take apart and repost it. At `/band/`, linked from the hub's Band heading.
  WAKE is listed under Band and on that page. `/take/` only forwards a take
  to the remix page, so it is not listed.

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

- [~] Phase 0: find out what plyr.fm allows from another site. No code shipped.
- [ ] Phase 1: plyr tracks as a source, opt-in only.
- [ ] Phase 2: remixes of sources with no original post, and a lineage record.
- [ ] Phase 3: publish a remix to plyr, by a deliberate button.
- [ ] Phase 4: show where a sound came from and what was made from it.

### 6. Audit of 2026-11-16

Every page was loaded at phone, laptop and wide sizes with `scripts/sweep.py`
and looked at. One surface per commit, in this order, stopping after each.
Nothing here changes a piece's copy or concept.

Broken or wrong now

- [x] `sitemap.xml` was missing `language-instrument/`. `scripts/check.sh` now
  fails when the registry, the hub's copies and the sitemap disagree.
- [ ] `sator/` (unlisted): cannot run. It fetches `stats.json`, which was
  never committed. Ask the owner for the file, or rebuild it from `sator/lang/`.
- [ ] `ximeremix/`: the band handle `rainwatchbaseball.bsky.social` no longer
  resolves, so every load logs a failed request. Takes still arrive by account
  id. Remove the handle or replace it. (Wait for part 5, which holds the page.)
- [ ] `syllababbler/`: white bands either side of the dark column on a wide
  screen; the page background is not set outside the column.
- [ ] `semantic-voyage/`: the loading line runs past 100% ("charting · 123%"),
  and each load asks for a `data.html` that is not there before falling back.
- [ ] `idiophone/`: publishing signs in at `bsky.social` only, so an account
  hosted elsewhere cannot publish; and its records hold decimals, which
  atproto may refuse. Test with a real account. Fix with the shared sign-in below.
- [ ] `registry-master.json` is stale: 11 published pieces are missing from
  it (pentimento, apophasis, dof, language-instrument, slopflag, idiophone,
  descent, margin-walker, agentic-entropy, clef, ximeremix); it still uses the
  old section names; some entries are older names for pieces now live
  (figure-ground-type is `split/`, slop-flag is `slopflag/`, musical-time-clock
  looks like `polyrhythm/`); and lode, sator, crypsis, chip and rig are absent.
  The owner decides the section names; then reconcile.

Text contrast (a fixed rule)

- [ ] `dof/`: the whole page is dimmed on navy, title and intro included.
- [ ] `kelp/`: the opening line and the control labels are dim and 10px.
- [ ] `split/`: slider labels and the note are pale grey on white.
- [ ] `sortition-congress/`: grey 11px labels on sage.
- [ ] `circlefornia/`: 10px labels at low contrast over the map.
- `aureole/` has the same fault; it waits for the rebuild in part 2.

Viewer first

- [ ] `agentic-entropy/` and `clef/`: on a phone the chart opens zoomed into
  its top-left corner with the title cut off. Open on the whole chart.
- [ ] `signgularity/` and `chip/`: rows of controls run off the right edge on
  a phone and scroll sideways with nothing to show there is more.
- [ ] `descent/`, `pentimento/`, `clipper/`, `ximeremix/`: on a wide screen
  the page is pinned to the left edge or stretched the full width.
- [ ] `lode/` (unlisted): its instructions are clipped on a phone.
- [ ] No `prefers-reduced-motion` handling in `circlefornia/`, `fullcolor/`,
  `lode/`, `shellac/`, `remix/give/`.
- [ ] Touch targets under 30px: the words in `nimbus/`, most of `shellac/`
  and `kelp/`, the sliders in `bz/`.
- Keyboard use was not checked by hand; about 25 pages bind no keys at all.

Site-wide

- [ ] About 30 pages have no description or share tags, so a pasted link
  shows nothing. One mechanical pass, each taken from the piece's own blurb.
- [ ] One shared atproto sign-in (handle, the account's own server, app
  password) for `idiophone/`, `ximeremix/`, `remix/give/` and `slopflag/`.
  This is the first code worth sharing; part 5 needs it too.
- [ ] One shared "record what you hear, take it to XIMEREMIX" for the sound
  pieces. `idiophone-next/` has it; `kelp/`, `polyrhythm/`,
  `language-instrument/` and `chip/` could carry the same few lines.
- [ ] Merged remote branches can be deleted (audit-fixes, rig-and-chip,
  promote-shellac-ximeremix and others).

Unfinished and unpublished

- In the repo, unlisted: `crypsis/` (looks finished; publish?), `lode/`,
  `sator/`, `chip/` and `rig/` (band tools; list on `/band/`?), `fullcolor/`
  (a start button and nothing else until pressed), `skew` (pull request 7),
  the front door branch. Each needs the owner's yes or no.
- Live with a low finish score: `nimbus/` 60, `slopflag/` 60, `clipper/` 65.
- In the master list as live but not in this repo: text-temperature,
  drone-clock, guitar-tuner, datamosh, glitch-word-processor, pixel-converter,
  organology-organ, top-chicken, bartlebluesky, lexicon-devil, the-receipt,
  n-10-122. Bringing them in needs the builds.
- New, proposed: a reader for `idiophone/` that plays anyone's published
  objects from their handle; Organology Organ beside it.

### Later, only if needed

- A front door showing the strongest handful of pieces in plain words.
  A draft is on the `front-door` branch at `/door/`, not on main; the owner
  picks the pieces.
- Subdomains, a private repo for internal tools, a locked backroom.

## Open questions for the owner

- The Venn view did not match what was pictured. What should it look like?
- `somesets/` and `bz/`: rework, fold into Vision, or retire? bz now also
  lives inside WAKE (every other variation); its own page is still up.
