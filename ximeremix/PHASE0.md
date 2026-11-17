# XIMEREMIX and plyr.fm: phase 0 answers

Asked on 2026-11-16 with real requests, sent as `https://opposite.city` and
from a page on `localhost`. No code shipped. Numbers come from the 50 most
recent public tracks unless a line says ten.

## The six questions

1. **Can a page here read plyr's API?** Yes. `api.plyr.fm` answers
   `/search/`, `/tracks/` and `/tracks/{id}` with permission for whichever
   site asks. A page on `localhost` read a track's title directly.
2. **Can a page here fetch and decode audio from `audio.plyr.fm`?** Yes. It
   allows other sites and serves partial ranges. A WAV fetched and decoded in
   Chromium (38.5 s, stereo, 48 kHz).
3. **Do tracks carry `audioBlob`, and can it be fetched from the artist's own
   server?** Nine of ten did. All nine came back through
   `com.atproto.sync.getBlob` with permission for another site, from five
   different servers, three of them not run by Bluesky. An MP3 fetched that
   way decoded in Chromium (49.8 s). The tenth track had downloads turned off
   and carried neither a blob nor a public address.
4. **Which file types?** MP3 and WAV, 7 and 3 of ten. WAV is safe to publish:
   it is in use there now. Whether plyr accepts what `MediaRecorder` makes
   (WebM/Opus in Chrome, MP4/AAC in Safari) is **not answered**; its API
   description names no formats. It needs one signed-in upload to find out.
5. **Is there already a "you may remix this" tag?** Not really. `remix` is on
   8 tracks and means "this is a remix". `sample` is on 13. Nothing for
   `remixable`, `stems`, `cc0` or `cc-by`.
6. **Largest blob the owner's server accepts?** **Not answered**; it needs a
   signed-in upload. One fact bounds it: a 114 MB WAV sits as a blob on a
   Bluesky-run server today, and a 238 MB MP3 on a self-hosted one.

## What that decides

The preferred route works: open a plyr track by account id and blob id,
exactly as a take opens now. Nothing is needed from plyr's servers to play
one, and plyr's API can be used for search and listing.

## Two things the brief did not ask, and should have

- **plyr already records the artist's wish.** Every track has a download
  setting: `open`, `ask`, `supporters` or `off`. Of 50 tracks: 28 open,
  8 ask, 14 off or supporters. The 14 have no public blob or address at all,
  so they cannot be loaded anyway. This is the natural floor for "opt-in
  only": never offer a track that is not `open`.
- **Tracks can be enormous.** Blobs ran from 0.4 MB to 238 MB; some are
  hour-long mixes. A tab cannot decode those. Phase 1 needs a ceiling, by the
  `duration` every track carries, before it fetches anything.

## Decisions for the owner before phase 1

1. What counts as opting in: download set to `open` alone, or `open` plus a
   tag the artist adds (a new one, say `remixable`, since none exists)?
   Recommended: `open` plus the tag. `open` means "you may download", which
   is less than "you may remix and repost".
2. The ceiling on length. Recommended: ten minutes, the same order as a take.
3. Whether to use plyr's search, or only list tracks from accounts the viewer
   names. Recommended: search, filtered by the rule in 1.
