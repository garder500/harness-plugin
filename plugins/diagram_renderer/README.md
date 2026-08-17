# diagram_renderer

Moteur de rendu de diagrammes Mermaid / PlantUML pour le rôle **Architecte**.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `source` | string | — | le source du diagramme |
| `kind` | enum | `mermaid` | `mermaid` \| `plantuml` |
| `output` | string | — | chemin de sortie optionnel (sinon `diagrams/<id>.<format>`) |
| `format` | enum | `svg` | `svg` \| `png` |

## Comportement

1. Écrit le source dans `diagrams/<id>.mmd|puml` du workspace.
2. Tente le rendu via CLI : `npx -y @mermaid-js/mermaid-cli` ou `npx -y plantuml-cli`.
3. Succès → `rendered: true` + chemin + taille. Échec (CLI absente, erreur, sortie manquante) →
   `rendered: false` avec le **source conservé** et la note d'installation — l'appel ne plante jamais.

## Activation

Dynamique (session courante) : `cordis_define` → `cordis_run` avec `host.js` en moitié Host.
Câblage durable : empaqueter en npm et monter via `fragment.yml` (cf. `docs/orchestration.md` §6).
