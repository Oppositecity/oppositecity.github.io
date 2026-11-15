# XIMEREMIX opens up: brief for Claude Code

Written in chat on 2026-11-15, from a planning conversation with the owner.
Read `CLAUDE.md` at the repo root first; every rule there applies here. This
file only adds what is specific to this job.

## What this is for

XIMEREMIX began as the page where people take apart the Opposite City band's
takes. The owner now sees it as something more open: somewhere between a band,
a label, a remix tool and a small music community on atproto. The band stays,
but as one resident and one source among several, not as the reason the page
exists.

The first concrete step is to connect XIMEREMIX to [plyr.fm](https://plyr.fm),
an open-source audio streaming app on atproto, in both directions:

- plyr tracks become a source you can take apart here
- a remix made here can be published to plyr as a track

and to start recording where each remix came from, so that remixes of remixes
can be traced.

No new name, no new domain, no redesign. Those wait until other people are
actually using it.

## How to work through this

- Work in a preview folder: copy `ximeremix/index.html` to
  `ximeremix-next/index.html` and change only the copy. Unlisted, as
  `CLAUDE.md` describes. The live page is not touched until the owner
  approves a phase.
- One phase at a time. After each phase: stop, say in plain words what
  changed and what to try, and wait. The owner tries it on a phone and a
  laptop before the next phase starts. Do not run ahead.
- Phase 0 ships no code. Its answers change how phases 1 and 3 are built,
  so do it first and report before writing anything.
- Claim the work in `CLAUDE.md` (fix list, part 5) before starting.
- Headless audio check before any merge, as `CLAUDE.md` requires.
- The page is one file with no build step and no libraries. Keep it that way.
- Anything in this brief marked **verify** is something chat could not test
  (chat cannot reach plyr.fm or opposite.city). Test it; do not trust it.

## What the page already does (so nothing gets rebuilt)

Read `ximeremix/index.html` before planning. The relevant parts, by function
name:

- **Any sound has one address: an account id and a blob id.** `parseHash()`
  reads `#did/cid?settings`, and `playTake()` fetches that blob from the
  account's own server with `com.atproto.sync.getBlob`, then `decodeBytes()`
  decodes it (the band's own compact format first, then anything the browser
  can decode). Nothing in that path is specific to the band. A plyr track that
  keeps its audio as a blob on the artist's server can very likely be opened
  by this page today with no new plumbing. **verify**
- **Sign-in already works for any account.** `signInS()` takes a handle and an
  app password and keeps the session in `S`. Everything posted goes to the
  signed-in person's own account, not to the band's. `callS()` writes records;
  `callBin()` uploads audio.
- **Posting a new sound**: `postTake()` uploads the audio, writes a
  `city.opposite.take` record that holds it, and makes a Bluesky post linking
  back here.
- **Posting a remix**: `postRemix()` posts the current link (the settings are
  in the link) as a reply under the take's original post, which `findAnchor()`
  looks up. A remix is settings applied to a source, not new audio.
- **Recording the output**: `bounce()` records what you hear to a file and to
  the shelf.
- **The front door**: `catChrome()` builds the row of source words (record,
  file, shelf, takes, records). `loadCatalogue()` and `readTakes()` list the
  band's takes from the accounts in `DIDS` and `HANDLES`.

## What plyr.fm is, in the terms that matter here

Source: plyr's own docs in its repository,
[github.com/zzstoatzz/plyr.fm](https://github.com/zzstoatzz/plyr.fm), under
`docs/public/` (lexicons, developer quickstart) and
`docs/internal/architecture/jetstream-ingest.md`. Read those three before
phase 1; they are short.

- A track is a record of type `fm.plyr.track` in the artist's own account.
  Required: `title`, `artist`, `fileType`, `createdAt`. Optional: `audioUrl`,
  `audioBlob`, `album`, `duration`, `imageUrl`, `description`, `supportGate`,
  `labels`, `tags` (up to 20 strings). At least one of `audioUrl` or
  `audioBlob` must be present. When both are present the blob on the artist's
  server is the real copy and the URL is a faster mirror.
- plyr has a public read API at `https://api.plyr.fm` (schema at
  `/openapi.json`): search at `/search/?q=…&type=tracks`, a track at
  `/tracks/{id}`, which returns the audio URL (`r2_url`) and the record's
  address (`atproto_record_uri`). Check `gated` and `visibility` before
  offering a track.
- plyr picks up track records written by other apps. If an account writes an
  `fm.plyr.track` record straight to its own server, plyr's index creates the
  track from it. Two conditions from their notes: the account must already be
  known to plyr (it has signed in at plyr.fm at least once), and an `audioUrl`
  that is not on plyr's own storage is ignored, so a record written from here
  should carry `audioBlob` only.
- Tracks tagged `ai`, `ai-slop` or `suno` are hidden from plyr's main feeds.
  Granular remixes of recordings are not generated audio and do not take that
  tag.
- plyr scans uploads for copyright matches and has a labeler. Assume remixes
  of old commercial records can be flagged even when the source is in the
  public domain.

## Phase 0: find out (no code shipped)

Answer these with real requests from a page served on `localhost` and, where
it matters, from a throwaway page in `ximeremix-next/` on the live origin,
because cross-site rules depend on the origin. Report the answers to the owner
in plain words.

1. Can a page on another site read `https://api.plyr.fm/search/` and
   `/tracks/{id}`? (Does the API send cross-site permission headers?)
2. Can a page on another site fetch and decode audio from plyr's storage
   (`audio.plyr.fm`)? Fetch a track's bytes and run `decodeAudioData`.
3. For ten recent public tracks: how many carry `audioBlob`? For those, does
   `com.atproto.sync.getBlob` on the artist's server return the audio to a
   page on another site, and does it decode?
4. Which file types are in use, and which does plyr accept for a track written
   by another app? Which of the formats `MediaRecorder` produces in Safari and
   Chrome are among them?
5. Which tags already exist on plyr for "you may remix this", if any (look for
   `remix`, `remixable`, `stems`, `cc0`, `cc-by`)? How many tracks carry them?
6. What is the largest blob the owner's account server accepts?

What the answers decide:

- If 3 mostly works: load plyr tracks through the blob address, exactly as
  takes load now. This is the preferred route; it needs nothing from plyr's
  servers.
- If only 2 works: load by audio URL. The link format then needs a second
  kind of address for a source that has no blob. Propose the format to the
  owner before building it.
- If neither works: stop and tell the owner. The fallback is a small proxy,
  which is a hosting decision, not a code detail.
- If 1 fails: list tracks without plyr's API, by reading `fm.plyr.track`
  records directly from an account's server with `listRecords` (the page
  already lists posts this way in `readTakes()`). That gives "tracks by
  account" but not search or tags.

## Phase 1: plyr as a source

One new word in the front door row: `plyr`. Choosing it shows a list in the
same panel the takes list uses, in the same style.

- What the list shows, in order: the signed-in person's own plyr tracks, if
  signed in; then tracks carrying the opt-in tag (see Consent below).
- A text box (visible box, per the design rules) to look up one account by
  handle and list its tracks.
- Each row: title, artist handle. Choosing one loads it into the instrument
  through the same path as a take, with the settings reset.
- Never list a track that is gated (`supportGate`), not public, or carries
  content labels.
- Once loaded, the page shows what it is and whose: title, artist, and a link
  to the track on plyr.fm. This credit stays visible while the track is
  loaded. It is a reference, so it earns its place under the design rules.
- Loading a long track must not freeze a phone. The page was built for takes
  of a few minutes. Find the length at which analysis becomes slow on a phone
  and either cap what is loaded (first N minutes, saying so) or let the person
  choose a stretch. Report what you measured.

### Consent

Other people's music is offered here only when they have said yes.

- The opt-in is a tag on the track. Use whatever phase 0 finds already in use
  on plyr; if nothing is, the working tag is `remixable`. The owner confirms
  the tag before this phase is merged.
- A direct link to any blob has always opened here and still does. The rule is
  about what the page *offers*, not about what a link can do.
- The band's own tracks, once on plyr, carry the tag.

### Copy

`CLAUDE.md` says not to rewrite a piece's copy. This brief permits exactly
these changes, and the owner approves the wording at the preview:

- the new `plyr` word in the front door row
- the line under the masthead when the plyr list is open
- the credit line for a loaded plyr track

The band's name and the `takes` source stay as they are.

## Phase 2: where a remix came from

Today a remix exists only as a reply post with a link. Two gaps:

1. A source with no original post (a plyr track, a file, a record from
   SHELLAC) has nothing to reply under, so `postRemix()` fails for it.
2. Nothing machine-readable says "this was made from that".

Changes:

- When the source has no post to reply under, post the remix as a post of its
  own, with the link, and with the source credited in the words: title, artist
  handle, link to the track on plyr.
- Alongside every posted remix, write one small record in the remixer's own
  account that states the lineage. Working shape, to be shown to the owner
  before any record is written to a real account, because records are public:

  ```
  city.opposite.remix
    source        the audio that was taken apart: account id + blob id
    sourceRecord  the record that holds it, when known (uri + cid):
                  a city.opposite.take or an fm.plyr.track
    settings      the settings string, the same one the link carries
    link          the remix link
    post          the Bluesky post that announced it (uri + cid)
    createdAt
  ```

- The name and shape are a first draft; say what you would change.
- Do not publish a formal schema or touch DNS for it. Not yet.
- Test against a throwaway account first, never the band's account.

## Phase 3: publish a remix to plyr

A deliberate button, separate from the everyday repost. Nothing is ever
published to plyr automatically; a small community should not be flooded.

- Flow: `bounce()` already captures the output. After a bounce, offer
  "publish to plyr". It asks for a title, shows the tags it will apply, and
  shows the credit line it will write.
- It uploads the audio as a blob to the signed-in account and writes an
  `fm.plyr.track` record there with `audioBlob` only (no `audioUrl`):
  `title`, `artist` (the account's display name or handle), `fileType`,
  `duration`, `createdAt`, `tags`, `description`.
- `description` credits the source (title, artist, link) and links back to the
  remix here.
- `tags`: `ximeremix`, plus the opt-in tag, switched on by default with a
  visible way to switch it off.
- The file format comes from phase 0, question 4. If nothing `MediaRecorder`
  produces is accepted, encode a WAV in the page and cap the length so it fits
  the blob limit from question 6. Say what the cap is.
- The account must have signed in at plyr.fm once, or plyr ignores the record.
  Detect the likely case (no `fm.plyr.actor.profile` record in the account)
  and tell the person, with a link to plyr.fm, instead of publishing into
  silence.
- After writing, confirm the track actually appears on plyr (`/tracks` by
  account, or the artist page) and show the link. If it has not appeared
  after a reasonable wait, say so plainly; do not report success.
- Write the lineage record from phase 2 for it too, pointing at the new track.
- Test with a throwaway account. Ask the owner before publishing anything
  from the band's account.

## Phase 4: show the lineage

Small, and only once phases 2 and 3 have produced real records.

- For a loaded source: a line saying what it was made from, when a lineage
  record says so, with a link that loads the parent here.
- For a loaded source: how many remixes point at it, and a way to open them.
  Finding records that point at something needs an index across accounts. The
  Slop Flag studio already relies on the public Constellation index for this;
  see whether it covers a custom record type before building anything.
  **verify**

## Not in this job

- Renaming the page or the project, a new domain, a redesign.
- Payments, supporter gating, splits. plyr has supporter gating; note what you
  learn about it, build nothing.
- Logging plays in teal.fm's format. Worth doing later; it would give play
  counts per source a standard shape.
- Replacing app passwords with the newer sign-in. Later, and only if app
  passwords stop being enough.
- The Cardputer recorder, SHELLAC, the rig, the band page. Untouched.

## Things to raise with the owner as they come up

- The opt-in tag name.
- Whether the takes list should also become open to any account that has
  `city.opposite.take` records, not only the band's.
- Whether the band's existing takes should be published to plyr, and by whom
  (a script, or by hand through the new button).
- Anything in plyr's behaviour that suggests asking its maintainer first. It
  is one person's alpha project; if this page would send it unusual traffic or
  unusual records, say so and suggest the owner get in touch before phase 3
  goes live.
