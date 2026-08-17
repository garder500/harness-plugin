# harness-plugin

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

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

### Making a repo-owned preset mount

The harness discovers presets from two roots, in precedence order: the deployment's SHIPPED root
(`trust: system`, injected by the CLI) first, then the user root `${DSH_HOME}/.agent-presets`
(`trust: user`). An earlier root wins a duplicate id, so **the shipped ids `code`, `cordis`,
`minimal`, and `standard` are reserved by the deployment** — a synced copy with one of those names
is shadowed and never mounts.

To make a repo-owned preset authoritative:

1. Copy the preset into this repo under a distinct id, e.g. `presets/my-cordis/`, and edit the copy.
2. Install it with `./scripts/sync.ps1` (mirrors `presets/<id>/` into
   `${DSH_HOME}/.agent-presets/<id>/`; `-DryRun` previews it).
3. The roster picks the user-root copy up on next discovery (no restart needed), and it wins over
   nothing — its id is unique.

Never edit the shipped install beside the deployment config.

### Orchestration à 4 rôles

`presets/orchestrator/` + `presets/{architect,developer,tester,designer}/` décrivent une équipe de
développement modulaire (Architecte / Développeur / Testeur / Designer) pilotée par un
Orchestrateur. Le protocole de hand-off (Cadrage → TDD → Code → Validation), les contrats
d'artefacts et le câblage des sous-agents à toolset restreint (`toolFilter`) sont dans
[`docs/orchestration.md`](docs/orchestration.md).

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

## License

This repository is open source under the **MIT License** — see [`LICENSE`](LICENSE) (Copyright
(c) 2026 Garder500).

## Attribution

Most of this repository is original work licensed MIT (see `LICENSE`). The exception is the shipped
preset copies under `presets/{code,cordis,minimal,standard}/` (plus the two skills they carry),
which are verbatim copies of the DeepSeek Harness shipped configuration
(`apps/cli/config/agent-presets`) — **MIT licensed, Copyright (c) 2026 DeepSeek**. They are kept
here so they remain installable as the "source of truth" while the deployment upgrades overwrite
their own copies. See the header comment in each `presets/<id>/agent.cordis.yml` for provenance.
