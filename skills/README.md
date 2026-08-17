# skills

Standalone skills owned by this repo: one directory per skill, containing a `SKILL.md`
(frontmatter `name` + `description`, then the instruction body).

A skill becomes visible to an agent when a mounted composition registers its directory, for
example:

```yaml
- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'
  config:
    customSkillDirs:
      - /path/to/harness-plugin/skills
```

## Convention

- `skills/<kebab-case-name>/SKILL.md`
- Frontmatter: `name` (used by the `skill` tool) and `description` (one line, shown in the catalog).
- Keep each skill self-contained: the instruction body must not assume context from a conversation.

## Skills bound to a preset

Skills that only make sense inside one agent preset live inside that preset's own directory
(`presets/<id>/skills/<name>/SKILL.md`) — the `cordis` preset is the current example. The harness
copies the whole preset directory when mounting, so those skills travel with it. Only skills that
are genuinely global (registered for every session) belong here.
