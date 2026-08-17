# grep_search

Targeted lexical filter over ONE file with context lines — extracts only the
keyword lines and their adjacent lines instead of ingesting 5 000 lines.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `target_file` | string | — | the file to search; relative paths resolve against the session workspace |
| `regex_pattern` | string | — | JavaScript regular expression (no flags, matched per line) |
| `context_lines` | number | 2 | adjacent lines per match, capped at 10 |

## Behavior

Returns a deduplicated, line-numbered window of match lines + context, capped at 100 matches /
250 rendered lines; `truncated` reports omitted matches. Rendered with `>` marking match lines.

## Activation

Dynamic (current session): `cordis_define` → `cordis_run` with `plugins/grep_search/host.js` as
the Host half. Durable wiring: package `host.js` as an npm package and mount with
`fragment.yml`'s row in `cordis.patch.yml`.
