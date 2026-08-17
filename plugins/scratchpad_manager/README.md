# scratchpad_manager

Persistent working-memory block-notes (`state.md`) — decouples working state
from the conversation history.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `action` | enum | — | `read` \| `append` \| `overwrite_section` |
| `key` | string | — | section key: letters, digits, spaces, `_`, `-`; max 64 chars |
| `content` | string | — | required for `append` / `overwrite_section` |

## Behavior

Manages `<session-workspace>/state.md`, organized as `## key` sections:

- `read` — returns the whole scratchpad (or one section).
- `append` — appends to a section, creating it if missing.
- `overwrite_section` — replaces a section entirely.

The file is durable on disk, so the harness can truncate conversation history while a later
session re-injects only this condensed scratchpad. Writes go through the `fs` service (the local
provider creates the file if missing).

## Activation

Dynamic (current session): `cordis_define` → `cordis_run` with `plugins/scratchpad_manager/host.js`
as the Host half. Durable wiring: package `host.js` as an npm package and mount with
`fragment.yml`'s row in `cordis.patch.yml`.
