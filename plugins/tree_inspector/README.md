# tree_inspector

Hierarchical index with estimated block sizes — zero data dump.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `path` | string | — | file or directory; relative paths resolve against the session workspace |
| `max_depth` | number | 3 | directory recursion depth, capped at 8 |
| `include_token_estimates` | boolean | true | per-entry `~N tokens` estimates (chars/4) |

## Behavior

- **Directory** → the folder tree (flat rows with `depth`), total files, total bytes, and an
  estimated token total. Never reads file contents.
- **File** → a table of contents: heading-like lines (`#`, `def`, `class`, `function`, …) with line
  numbers and per-line token estimates. Files > 512 KB refuse the TOC (use `chunk_reader` /
  `grep_search` instead).
- Hard caps: 1000 nodes, 200 TOC entries, 5000 scanned lines.

The agent spots where to go without loading content, then reads only the interesting slice.

## Activation

Dynamic (current session): `cordis_define` → `cordis_run` with `plugins/tree_inspector/host.js` as
the Host half. Durable wiring: package `host.js` as an npm package and mount with
`fragment.yml`'s row in `cordis.patch.yml`.
