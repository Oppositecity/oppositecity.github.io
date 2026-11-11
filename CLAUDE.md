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
  - [ ] Revisit: a better way to tilt up and down. Today it is drag, or
    Shift + up/down on a keyboard; there is nothing on a phone besides drag.
- [x] `apophasis/`: fix page margins and the spacing of the word field so
  alternatives do not crowd or collide, on phone and on laptop.
- [x] `room/`: desktop and laptop layout pass. It was built for a phone;
  make the measure, type size and controls sit properly on a wide screen.
  Became a rework at the owner's direction: no controls or text, driven by
  any activity, endless drift tethered to each spoken word.
- [ ] `dof/`: make the full list view with bits per word the main view.
- [ ] `pentimento/`: reconcile the laptop and phone layouts of the word field.

### 2. Deploy backlog

- [ ] `aureole/`: the live page is still the old synonym-cloud build. The
  etymology rebuild was chosen and never deployed. Ask the owner for that
  build; do not reconstruct it.
- [ ] Accursed Share: canonical build exists, never deployed. One figure
  (DRAM gross margin) is unverified and must be checked or cut first.
- [ ] `clef/`: needs its text.
- [ ] Folklore classifiers (Thompson motif index, ATU tale types): finish and
  deploy. Ask for the current builds.

### 3. Band and sound

- [ ] `shellac/`: add a clip control that sends a chosen stretch of a record
  to `clipper/`, which already hands off to `ximeremix/`.
- [ ] A proper Band section page: the takes, the remix page, how to take a
  take apart and repost it.

### 4. Shared code, then new work

- [ ] After the fixes in part 1, pull out whatever device-handling code
  actually repeated (input, viewport, motion) into one shared file. Do not
  build it ahead of the evidence.
- [ ] New piece: floating language drawn from Wikipedia articles, clouding
  around the subject each describes.

### Later, only if needed

- A front door showing the strongest handful of pieces in plain words.
- Subdomains, a private repo for internal tools, a locked backroom.

## Open questions for the owner

- The Venn view did not match what was pictured. What should it look like?
- Should WAKE and the take pages be listed under Band?
- `somesets/` and `bz/`: rework, fold into Vision, or retire?
