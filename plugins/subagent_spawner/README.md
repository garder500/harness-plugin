# subagent_spawner

Disposable fresh-context subagent — context isolation for expensive exploration.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `subtask_instruction` | string | — | self-contained instruction; the child does not see this conversation |
| `context_artifacts` | array<{path, content?}> | — | paths for the child to read, or inline content (capped at 4000 chars each) |
| `max_output_tokens` | number | 100 | **words** allowed in the returned summary, hard-capped at 500 |

## Behavior

Spawns a child via the `spawn` subagent provider (blank context, fresh KV cache), instructs it to
STOP after the subtask, and returns only a strict word-capped summary. The word cap is enforced
client-side too: an over-limit child reply is truncated with a marker. The parent session never
sees the child's intermediate reading — saving tens of thousands of tokens.

## Activation

Dynamic (current session): `cordis_define` → `cordis_run` with `plugins/subagent_spawner/host.js`
as the Host half. Requires the `spawn` subagent provider (shipped with the `cordis`/`standard`
presets). Durable wiring: package `host.js` as an npm package and mount with `fragment.yml`'s row
in `cordis.patch.yml`.
