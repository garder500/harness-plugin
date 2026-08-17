# Orchestration multi-agents : équipe de développement à 4 rôles

Conception et câblage de l'écosystème de plugins du harness pour orchestrer une équipe de
développement modulaire : **Architecte**, **Développeur**, **Testeur**, **Designer**, pilotée par un
**Orchestrateur**.

## 1. Architecture

Le harness est Cordis : chaque capacité est une ligne de plugin, chaque rôle est une **composition
d'agent** (preset). Deux chemins d'exécution coexistent :

| Chemin | Mécanisme | Usage |
| --- | --- | --- |
| **Sessions de rôle** | Presets (`presets/<role>/`) montés comme sessions | travail long par rôle, pilotage humain |
| **Sous-agents de rôle** | Rows `tool-subagent` configurées avec un `toolFilter` par rôle | orchestration automatique (l'Orchestrateur délègue) |

L'attribution des outils est une question de **composition** : un rôle ne voit que les tools que son
preset monte (rows `tool-*`) et, pour les sous-agents, que l'allow-list du `toolFilter` de la row
`tool-subagent` qui le crée.

### Matrice rôle → outils

| Rôle | Outils requis (spec) | Mapping harness | Plugin |
| --- | --- | --- | --- |
| **Architecte** | AST / graphe de dépendances | `ast_analyzer` | `plugins/ast_analyzer` |
| | inspection d'arborescence | `tree_inspector`, `glob`, `chunk_reader` | `plugins/tree_inspector` |
| | rendu de diagrammes (Mermaid/PlantUML) | `diagram_renderer` | `plugins/diagram_renderer` |
| | doc technique via MCP/Search | `web_search`, rows `mcp-client` (cf. §5) | — |
| **Développeur** | édition chirurgicale (diff/patch/LSP) | `edit`, `write`, `read` (+ LSP `dsh-tool-lsp` optionnel) | — |
| | shell isolé | `pwsh` / `bash` (sandbox) | — |
| | gestionnaire de paquets | `pwsh` (`npm`/`pnpm`/`pip`) | — |
| | commandes Git atomiques | `pwsh` (`git`), `todo_write` pour le séquençage | — |
| **Testeur** | exécuteur de suites (Jest/Vitest/Pytest) | `run_tests` | `plugins/test_runner` |
| | analyseur de couverture | `coverage_analyzer` | `plugins/test_runner` |
| | linter / analyseur statique | `run_linter` | `plugins/test_runner` |
| | sandbox d'intégration | shell sandboxé + `artifact_offloader` pour les logs | — |
| **Designer** | capture headless (Playwright/Puppeteer) | `visual_capture` | `plugins/visual_capture` |
| | parser de Design Tokens (Tailwind/CSS) | `design_tokens_parser` | `plugins/visual_capture` |
| | validation a11y (axe-core) | `a11y_validator` | `plugins/visual_capture` |

### Commun à tous les rôles

`tool-fs` (read/write/edit), `tool-fs-search` (glob/grep), `tool-todo`, `tool-goal`, `plan-mode`,
`tool-ask-user`, et l'outillage mémoire (`scratchpad_manager`, `semantic_memory`) pour le hand-off.

## 2. Protocole de collaboration et hand-off

Chaque phase produit un **artefact de contrat** dans le workspace partagé ; le passage de phase est
un **gate** vérifié par l'Orchestrateur (ou le chef de rôle en session isolée).

```
workspace/
├── specs/
│   ├── api-contract.md      # Architecte : interfaces, endpoints, schémas de données
│   ├── ui-contract.md       # Designer : composants, tokens, exigences a11y
│   └── acceptance.md        # critères co-signés (Architecte + Designer)
├── tests/                   # Testeur : suites unitaires + intégration (rouges d'abord)
├── src/                     # Développeur : implémentation
└── reports/
    ├── validation.md        # Testeur : non-régression + couverture
    └── visual/              # Designer : captures d'écran
```

### Phase 1 — Cadrage (Architecte + Designer en parallèle)

- L'Architecte rédige `specs/api-contract.md` (contrats d'API, schémas, invariants) en s'appuyant sur
  `ast_analyzer`/`tree_inspector` sur le code existant.
- Le Designer rédige `specs/ui-contract.md` (structure des composants, tokens via
  `design_tokens_parser`, contraintes d'ergonomie).
- Les deux co-signent `specs/acceptance.md`.
- **Gate :** les trois artefacts existent et ne contiennent aucune ambiguïté de référence (noms de
  symboles, routes, props) — relire avec `grep_search`/`chunk_reader` si nécessaire.

### Phase 2 — TDD (Testeur seul)

- Le Testeur écrit les suites dans `tests/` **à partir des contrats uniquement** (pas du code).
- **Gate :** `run_tests` exécute les suites et elles **échouent** (rouge) — sinon les tests ne
  testent rien ou les contrats sont déjà satisfaits.

### Phase 3 — Code (Développeur seul)

- Le Développeur implémente dans `src/` jusqu'à ce que la suite passe.
- Contraintes : édition chirurgicale (`edit`/`write`), commits Git atomiques par étape, `todo_write`
  pour le séquençage.
- **Gate :** `run_tests` → tout vert ; `run_linter` → zéro erreur bloquante.

### Phase 4 — Validation (Designer + Testeur)

- Le Designer lance `visual_capture` sur les écrans et `a11y_validator`, écrit `reports/validation.md`.
- Le Testeur relance la suite complète + `coverage_analyzer`, vérifie l'absence de régression.
- **Gate final :** tests verts, couverture ≥ seuil convenu, a11y sans violation critique → merge.

## 3. Câblage Orchestrateur → sous-agents de rôle

La row `tool-subagent` accepte un `toolFilter` (allow/deny). L'Orchestrateur monte une row par rôle
pour que **chaque enfant ne reçoive que les outils de son rôle** :

```yaml
- id: subagent-architect
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    toolName: subagent_architect
    backgroundMode: one-shot
    toolFilter:
      allow: [read, write, glob, grep, pwsh, todo_write, plan_mode_enter, tree_inspector, ast_analyzer, diagram_renderer, web_search, chunk_reader, grep_search, scratchpad_manager]
```

Chaque phase = un appel `subagent_<role>` (ou `subagent_fork` quand le contexte hérite) avec un
prompt qui référence les artefacts de contrat par leur chemin exact. L'orchestration séquentielle
des 4 phases peut aussi être encodée dans un script `workflow` (cf. `docs/` du harness) ou pilotée
manuellement tour par tour.

## 4. Rôles détaillés

### Architecte — `presets/architect/`

Persona : valide les choix techniques, structure les interfaces, décompose en spécifications non
ambiguës. Outils : fs + `ast_analyzer` + `diagram_renderer` + `tree_inspector` + `web_search`.

### Développeur — `presets/developer/`

Persona : code propre, modulaire, strictement conforme aux contrats. Outils : fs (édition
chirurgicale) + `pwsh` (shell isolé, paquets, git) + `chunk_reader`/`grep_search`.

### Testeur — `presets/tester/`

Persona : TDD/BDD, exécute la validation, bloque les commits non conformes, rapporte avec logs.
Outils : fs + `pwsh` + `run_tests` + `coverage_analyzer` + `run_linter`.

### Designer — `presets/designer/`

Persona : charte, composants, rendu visuel, ergonomie. Outils : fs + `visual_capture` +
`design_tokens_parser` + `a11y_validator`.

## 5. Accès documentaire via MCP

Le harness monte les serveurs MCP comme rows `@deepseek-ai/dsh-mcp-client` (une par serveur,
`serverName` unique — schéma complet dans `mcp/README.md`). Un accès docs typique :

```yaml
- id: mcp-docs
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: docs
    transport: stdio
    command: npx
    args: ['-y', '@some-org/mcp-docs-server', '--root', '/path/to/docs']
```

Ne jamais committer de secrets : les `env` passent par le service de credentials. À défaut de
serveur MCP, `web_search` couvre la documentation publique.

## 6. État du câblage (à jour)

- **Actifs dans la session Orchestrateur** (dynamiques, `cordis_define` + `cordis_run`) : les
  plugins `plugins/*` — navigation (`tree_inspector`, `grep_search`, `chunk_reader`), mémoire
  (`scratchpad_manager`, `semantic_memory`), isolation (`subagent_spawner`), middleware
  (`artifact_offloader`), et les outils de rôle (`ast_analyzer`, `diagram_renderer`, `test_runner`,
  `visual_capture`).
- **Durables multi-sessions** : empaqueter chaque plugin en package npm
  (`@garder500/harness-plugin-*`), l'installer dans le profil, puis activer les rows correspondantes
  des presets de rôle (les rows des plugins de rôle sont en commentaire dans les presets tant que
  les packages n'existent pas).
