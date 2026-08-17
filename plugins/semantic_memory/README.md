# semantic_memory

Workspace-scoped episodic memory with lexical recall. Two tools:

## semantic_memory_recall

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `query` | string | — | free-text query |
| `top_k` | number | 3 | max facts returned, capped at 10 |
| `score_threshold` | number | 0.05 | minimum lexical score; raise for strong matches only |

Returns only the few most relevant stored facts as score-ordered bullets
(`- (score 0.83) <fact>`), ready to inject into the prompt as bullet points.

## memory_add

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `text` | string | — | the fact to remember, one self-contained sentence |
| `tags` | array<string> | — | optional tags, e.g. `["preference"]` |

Stores the fact in `.dsh-memory/memories.jsonl` inside the session workspace.

## Design notes

- **No embeddings, no network**: scoring is a BM25-style lexical scorer (term-frequency
  saturation × IDF) over the local JSONL entries. Real vector recall would require an embedding
  provider; the lexical fallback keeps the plugin self-contained.
- Memory is **workspace-scoped** (the store lives under the session cwd) because the dynamic
  Host environment exposes no `process`/env access to locate `DSH_HOME`.

## Activation

Dynamic (current session): `cordis_define` → `cordis_run` with `plugins/semantic_memory/host.js`
as the Host half. Durable wiring: package `host.js` as an npm package and mount with
`fragment.yml`'s row in `cordis.patch.yml`.
