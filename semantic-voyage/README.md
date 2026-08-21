# semantic voyage

`index.html` is 988 KB, but the engine inside it is only ~15 KB. The rest is
five `<script type="text/plain">` data blobs:

| id | size | contents |
|---|---|---|
| `d-words` | 166 KB | 20,480 words, newline separated |
| `d-pos` | 164 KB | Int16 3D UMAP coordinates, `/32000*520` |
| `d-knn` | 365 KB | 8 nearest neighbours per word, zigzag varint deltas |
| `d-sim` | 218 KB | delta-coded cosine similarity, decodes to 0.15–1.0 |
| `d-rank` | 55 KB | Uint16 frequency rank |

There are no 300d vectors here. Anything needing real embedding arithmetic
means regenerating from GloVe.

`fly.html` is the free-flight build. It carries no data of its own — it fetches
`data.html`, then falls back to `index.html`.

To promote it: rename `index.html` to `data.html`, then rename `fly.html` to
`index.html`. GitHub's rename field holds the whole path, so type
`semantic-voyage/data.html`, not `data.html`.

## measured

Correlation between projected 3D distance and true cosine distance, over the
163,840 real edges: **0.334**. True neighbours land anywhere from 0.34 to 989
units apart. The projection is honest about who your neighbours are and lies
about how far anything is. `fly.html` corrects this locally as you travel.
