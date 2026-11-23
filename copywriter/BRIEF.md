# Copywriter engine: brief for a fresh Claude

Written in chat on 2026-11-23, from the conversation that built `prism/` and
`feelhose/`. Read `CLAUDE.md` at the repo root first; every rule there applies
here. This file only adds what is specific to this job.

Working title in this brief: COPYWRITER. It is not a name. Do not call it
COPY: that is the owner's existing private text-management tool. The owner
names it.

## What this is for

A writing instrument that measures a draft word by word on human-rated scales
of meaning (how concrete, how easy to picture, how much it is felt in the
hands, the mouth, the gut, how dangerous, how warm, how early it is learned)
and helps move it toward a target feel without losing what it says.

Two uses, one engine:

- the owner's own writing (blurbs, page copy, poems, posts)
- copywriting in the trade sense: brand voice, product copy, headlines

The idea rests on a well-established finding in psycholinguistics: concrete,
easily pictured words are remembered better, and sensory language lands
harder. Good copy is measurably concrete, sensory and familiar. This tool
makes that measurable and steerable.

## What already exists (reuse it, do not rebuild it)

- `prism/lex.txt`: 65,360 English words × 31 lenses, each scored 0 to 100 on
  its study's own rating scale. Line 1 is JSON with each lens's key, label,
  family, `eng` (dictionary mean) and `run` (mean over everyday spoken
  English, weighted by SUBTLEX-US subtitle frequency). Every later line is
  `word<TAB>31 characters`; character code minus 33, over 93, times 100, is
  the score; a space means not rated.
- `prism/index.html` and `feelhose/index.html` each carry the same lookup
  (lower-case, simple suffix trimming, per-lens fallback through the forms),
  tokenising and scoring code. With this engine it would be the third copy:
  that is the evidence `CLAUDE.md` asks for before a shared file. Move it to
  `shared/lenses.js` (load, look up, score a text, profile a text against
  `run`) and switch the two existing pages to it in their own commits, one per
  surface, checked headless, so neither changes behaviour.
- The source datasets, with provenance, are described in the bundle the owner
  holds (`dimensions-of-meaning-data`, README inside). Not needed for v1.

## Licences: read before anything is sold

- NRC VAD Lexicon v2 (pleasure, arousal, control) and the ousiometer built on
  NRC v1 (goodness, power, aggression, danger, structure) are free for
  research and non-commercial use only; commercial use needs a licence from
  NRC Canada.
- Lancaster Sensorimotor Norms and the Glasgow Norms are CC BY 4.0.
- Brysbaert concreteness, Kuperman age of acquisition, labMT and the extended
  Moral Foundations Dictionary: terms not yet checked. Check before any paid
  use.

So: build v1 with every lens, but give the engine a `commercial` switch that
drops the non-commercial lenses and any not yet cleared, so a paid version is
one setting away. The page says which lenses are on and why.

## Version 1

One page at `copywriter/`, unlisted, on `/yard/`.

1. **A draft box** (boxed, per the design rules). Paste or type.
2. **A target.** Three ways to set it, simplest first:
   - presets, each a handful of lens targets, e.g. *sensory* (touch, taste,
     smell, sight up), *plain* (familiar up, learned-late down, concrete up),
     *warm* (pleasure and care up, danger down), *urgent* (arousal and power
     up). The owner may rename or replace these.
   - *match this*: paste a sample text; its profile becomes the target.
   - per-lens nudges: up, down or hold, on any of the 31.
3. **The reading.** The draft's profile against the target and against
   everyday English, lens by lens, numbers first (the owner found the numbers
   and ratios the interesting part of `prism/`). Then the draft itself, each
   word marked by how far it pulls away from the target on the lenses in play.
   Words no study rated are shown as unrated, never guessed.
4. **Swaps.** Tap a word: same-meaning candidates, ranked by how far each
   would move the draft toward the target, with the change shown in points.
   Candidates come from Datamuse in the browser (`api.datamuse.com/words?ml=`
   and `rel_syn=`; add it to the page's CSP `connect-src`), scored with the
   lexicon. Keep Datamuse's own relatedness score beside ours, so a swap that
   drifts in meaning is visible. Tapping a candidate swaps it in; undo is one
   tap.
5. **Compare.** Keep earlier drafts; show any two side by side with the
   profile difference.

Not in v1: an AI rewrite. If it comes later, follow `three-indexes/`: the
visitor's own API key, kept on their device, and every number shown is one
this page computed from the result, never one the model claims.

## Look and behaviour

House rules from `CLAUDE.md`: Courier, white on black, boxed inputs, nothing
rearranging unless the viewer caused it, phone first. In `feelhose/`, colour
marks the lens family: essence `#ff8a65`, feeling `#ffe14d`, body `#4dd9ff`,
substance `#8cff6a`, life `#c99bff`, moral `#ff7ad1`. Use the same family
colours here so the three pieces read as one body of work.

## How to work

- One branch and pull request per step, `(from chat)` on chat's commits.
  Order: `shared/lenses.js` first (and the two pages moved onto it, checked),
  then the page in stages: reading, target, swaps, compare.
- Headless check on every step: a fixture draft and target with known
  expected profile numbers (compute them once by hand from `lex.txt`), at 390
  and 1280 wide, no console errors. Mock Datamuse in tests; the container
  cannot reach it.
- Stop for the owner after the reading and target are working, before
  building swaps.

## Questions for the owner (do not decide them)

- The name.
- Whether a paid version is wanted; that decides how hard to push on licences.
- Which presets, and in what words.
- Whether drafts should be kept between visits (on the device only) or
  forgotten when the page closes.
