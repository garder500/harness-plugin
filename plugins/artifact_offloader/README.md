# artifact_offloader

Output-virtualization middleware — intercepts heavy tool outputs.

## Mechanism

Registers a `tools/post-execute` waterfall listener over the execution tools
(`pwsh`, `bash`, `web_fetch`, `web_search` by default — edit `TARGET_TOOLS` in `host.js`). When a
targeted tool returns more than the threshold:

1. The **full payload** is persisted to the harness spill store (`spillStore.saveText`).
2. The model receives only a **preview** — first 10 lines + last 5 lines — plus the artifact
   locator and its retrieval hint.
3. The agent then uses `grep_search` (with `target_file=<locator>`) or `chunk_reader` to mine the
   artifact for details.

## Tuning constants (top of `host.js`)

| Constant | Default | Meaning |
| --- | --- | --- |
| `THRESHOLD_TOKENS` | 500 | offload when estimated tokens (chars/4) exceed this |
| `PREVIEW_HEAD_LINES` | 10 | preview head |
| `PREVIEW_TAIL_LINES` | 5 | preview tail |
| `TARGET_TOOLS` | `['pwsh','bash','web_fetch','web_search']` | tools whose outputs are virtualized |

## Notes

- Errors and non-text results are never offloaded; if the spill save fails, the full result stays
  inline (best-effort, never fails the tool call).
- The waterfall always delegates through `next()` first and only rewrites the model-facing content
  (`{ kind: 'accept', content }`), preserving the canonical value.

## Activation

Dynamic (current session): `cordis_define` → `cordis_run` with `plugins/artifact_offloader/host.js`
as the Host half. Durable wiring: package `host.js` as an npm package and mount with
`fragment.yml`'s row in `cordis.patch.yml`.
