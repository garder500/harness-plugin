# plugins

Custom Cordis plugin sources owned by this repo. In the harness, a plugin is a Cordis plugin
package wired into a composition as a row. `plugins/<name>/` holds the source (Host and/or Client
half, plain JavaScript or a package with its own `package.json`) plus any composition fragment that
registers it.

## What belongs here

- **Custom plugins we author** — reusable tools, services, or browser UI contributed to a
  composition. Ship them as npm packages (installable into the profile's `node_modules`), each with
  a `cordis.yml` fragment showing the row that mounts it.
- **Dynamic plugin sources made durable** — plugins defined through the runtime toolset
  (`cordis_define`/`cordis_run`) are ephemeral: they live in the running process and vanish on
  restart. Saving the exact Host/Client source here, with the `pluginId` and `packageId`, is how a
  dynamic plugin becomes reproducible.

## Convention

```
plugins/<name>/
  host.js        # Host-half plugin source (returns a Cordis Plugin)
  client.js      # Client-half plugin source, when the plugin has browser UI
  fragment.yml   # the cordis row(s) that mount the plugin
  README.md      # what it does, IDs, and how to activate it
```

## Wiring into the harness

A plugin package must be installed into the profile that mounts it, and referenced by exact name in
a composition row — the `web` profile's wiring goes in `cordis.patch.yml`. See the harness
`cordis-plugin-development` skill (in `presets/cordis/skills/`) for the full authoring and
activation workflow.

## Current plugins

| Plugin | Tools | Purpose |
| --- | --- | --- |
| `tree_inspector` | `tree_inspector` | hierarchical index with estimated token sizes (zero dump) |
| `grep_search` | `grep_search` | targeted regex filter over one file with context lines |
| `chunk_reader` | `chunk_reader` | sliding-window file reader (hard 100-line cap) |
| `scratchpad_manager` | `scratchpad_manager` | persistent `state.md` working memory |
| `semantic_memory` | `semantic_memory_recall`, `memory_add` | workspace-scoped lexical memory recall |
| `subagent_spawner` | `subagent_spawner` | disposable fresh-context subagent, strict word-capped summary |
| `artifact_offloader` | — (middleware) | `tools/post-execute` waterfall virtualizing heavy outputs to spill artifacts |

Each directory holds `host.js` (the exact dynamic Host-half source), `fragment.yml` (the cordis row
for future npm packaging), and a `README.md`.
