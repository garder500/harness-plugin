# chunk_reader

Sliding-window reader — forces windowed reading and makes a whole-file load
into the prompt impossible.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `file_path` | string | — | the file to read; relative paths resolve against the session workspace |
| `start_line` | number | — | 1-based first line of the window |
| `limit_lines` | number | 50 | window size, **hard-capped at 100** (a larger value is rejected) |

## Behavior

Returns only the delimited slice with line numbers plus `totalLines`; page through a file with
repeated calls (`start_line = previous end + 1`).

## Activation

Dynamic (current session): `cordis_define` → `cordis_run` with `plugins/chunk_reader/host.js` as
the Host half. Durable wiring: package `host.js` as an npm package and mount with
`fragment.yml`'s row in `cordis.patch.yml`.
