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
  host.js        # Host-half source, DYNAMIC form (harness.defineTool/registerTool) — session-only
  index.js       # PACKAGED form: ESM module (named exports name/inject/apply), host-mountable
  package.json   # npm identity (@garder500/harness-plugin-<name>)
  fragment.yml   # the cordis row(s) that mount the plugin (relative to the profile baseUrl)
  README.md      # what it does, IDs, and how to activate it
```

## Packaging (workspace-wide activation)

Dynamic plugins (`cordis_define`/`cordis_run`) are session-only and die on restart. To make a plugin
**workspace-wide and durable**, `scripts/package-plugins.mjs` converts `host.js` into the packaged
form (`index.js` + `package.json`) using the real loader contract (`ctx.tools.register(defineTool(
…))`, named exports). The activation pipeline:

1. `node scripts/package-plugins.mjs` — regenerates `index.js` + `package.json` per plugin.
2. Copy `index.js` + `package.json` into `%DSH_HOME%\profiles\web\plugins\<name>\` (baseUrl-relative).
3. Add the row from `fragment.yml` to `cordis.patch.yml`. **Critical: NEW rows must use the
   `insert` patch form** — a plain `- id: … name: …` row is an id-targeted OVERRIDE and is silently
   skipped when the id does not already exist (the Include warns `patch: entry not found`). Only
   `- insert: [ … ]` appends new plugin entries.
4. The profile patch layer is HMR-watched: the plugins hot-apply without a restart. They also
   survive restarts (the patch is part of the boot composition).

`fragment.yml` holds the exact `insert` row; the shipped `cordis-plugin-development` skill documents
the authoring workflow.

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
| `ast_analyzer` | `ast_analyzer` | lightweight AST / dependency-graph scanner (**Architecte**) |
| `diagram_renderer` | `diagram_renderer` | Mermaid/PlantUML rendering, source always retained (**Architecte**) |
| `test_runner` | `run_tests`, `coverage_analyzer`, `run_linter` | QA suite: framework detection + coverage + lint (**Testeur**) |
| `visual_capture` | `visual_capture`, `design_tokens_parser`, `a11y_validator` | headless captures, token flattening, axe-core scans (**Designer**) |

Each directory holds `host.js` (dynamic form), `index.js` + `package.json` (packaged form, generated
by `scripts/package-plugins.mjs`), `fragment.yml` (the mount row) and a `README.md`. **All 11
plugins are mounted in the web profile host composition** (`cordis.patch.yml`, relative rows) —
after a harness restart they load at boot and are visible to every session. The 4-role orchestration
design lives in [`docs/orchestration.md`](../docs/orchestration.md).
