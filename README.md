# harness-plugin

Owned assets for the DeepSeek Harness: **Skills**, **MCP connections**, **agent Presets**, and **Plugins**.

This repository is the source of truth for the user-owned assets that extend the harness running
under `${DSH_HOME:-$HOME/.dsh}` (the `web` profile on this machine). Deployment-shipped files are
never edited in place — an upgrade overwrites them — so anything worth keeping or customizing lives
here and is synced out to the harness.

## Layout

| Path | Owns | Harness destination |
| --- | --- | --- |
| `presets/<id>/` | Agent presets, self-contained: `preset.yml` + `agent.cordis.yml` + any per-preset `skills/` | `${DSH_HOME}/.agent-presets/<id>/` |
| `skills/<name>/` | Standalone skills (`SKILL.md`) not bound to one preset | any composition's `customSkillDirs` |
| `mcp/<name>.yml` | MCP server connections as `mcp-client` composition fragments | host composition rows (via `cordis.patch.yml` or a bundle) |
| `plugins/<name>/` | Custom Cordis plugin sources | installed into the profile's `node_modules`, wired as composition rows |

## Presets

`presets/` holds verbatim copies of the four presets shipped with the deployment
(`apps/cli/config/agent-presets`), kept here so we own them and can diverge:

| Preset | What it is |
| --- | --- |
| `standard` | The full-featured coding agent: file editing, shell, file and web search, skills, planning, goals, subagents, workflows. |
| `code` | Everything in `standard`, plus a Code Mode SDK toolset that composes multi-step operations as one TypeScript program. |
| `minimal` | A two-tool coding agent: persistent bash + `str_replace_editor`. |
| `cordis` | Everything in `standard`, plus the self-referential Cordis toolset and the composition-authoring skills. **This session runs on it.** |

The `cordis` preset carries its two skills inside its own directory
(`presets/cordis/skills/`), because its composition resolves them relative to the preset's install
location (`baseUrl`). Keep per-preset skills inside the preset directory; the harness copies the
whole directory when mounting.

To customize a preset: edit the copy here, then sync the directory to
`${DSH_HOME}/.agent-presets/<id>/`. Never edit the shipped install beside the deployment config.

## Skills

Standalone skills live under `skills/<name>/SKILL.md` (frontmatter `name` + `description`, then the
instruction body). They are registered through a composition row such as:

```yaml
- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'
  config:
    customSkillDirs:
      - /path/to/harness-plugin/skills
```

Skills that belong to one preset travel inside that preset's directory instead (see Presets).

## MCP connections

MCP servers are wired into the host composition as `mcp-client` plugin rows — one row per server,
each with a unique `serverName`. `mcp/` owns one YAML fragment per connection, ready to splice into a
composition. See [`mcp/README.md`](mcp/README.md) for the config schema and an example.

## Plugins

A plugin in this harness is a Cordis plugin: an npm package (or package-private Host/Client source)
wired into a composition as a row. `plugins/` owns the source of custom plugins, plus the fragments
that register them. Dynamic plugins created through the runtime toolset are ephemeral — saving their
source here is how they become durable. See [`plugins/README.md`](plugins/README.md).

## Attribution

The preset files in `presets/` are copies of the DeepSeek Harness shipped configuration
(`apps/cli/config/agent-presets`), MIT licensed, Copyright (c) 2026 DeepSeek.
