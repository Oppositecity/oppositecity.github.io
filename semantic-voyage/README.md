# semantic voyage

`index.html` is the engine. The word data is not in this folder: it is read
from `./data.html` if one exists, otherwise from the commit that still holds
it on raw.githubusercontent (see `DATA_SOURCES` in `index.html`). That data
is five `<script type="text/plain">` blobs:

| id | size | contents |
|---|---|---|
| `d-words` | 166 KB | 20,480 words, newline separated |
| `d-pos` | 164 KB | Int16 3D UMAP coordinates, `/32000*520` |
| `d-knn` | 365 KB | 8 nearest neighbours per word, zigzag varint deltas |
| `d-sim` | 218 KB | delta-coded cosine similarity, decodes to 0.15–1.0 |
| `d-rank` | 55 KB | Uint16 frequency rank |

There are no 300d vectors here. Anything needing real embedding arithmetic
means regenerating from GloVe.

`fly.html` is only a redirect to `./`.

## moving

Words never move. The viewer moves only while steering, and stops on release.

- hold (finger or mouse), W or ↑: fly forward
- ↓: fly backward
- ← →: turn
- Shift + ↑ ↓: tilt
- drag: turn and tilt
- tap a word: jump to it
- N, or an empty search: drop in somewhere else

## measured

Correlation between projected 3D distance and true cosine distance, over the
163,840 real edges: **0.334**. True neighbours land anywhere from 0.34 to 989
units apart. The projection is honest about who your neighbours are and lies
about how far anything is.

A local truing pass that pulled nearby words toward their measured distances
is still in `index.html`, switched off (`RELAX_ON`), because it moved words
around the viewer.
