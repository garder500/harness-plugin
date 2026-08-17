# ast_analyzer

Analyseur AST / graphe de dépendances léger pour le rôle **Architecte**.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `path` | string | — | répertoire source à analyser (résolu contre le workspace) |
| `max_files` | number | 100 | fichiers source scannés, cap 500 |
| `include_external` | boolean | true | edges `external:<spec>` pour les imports non relatifs |

## Comportement

Marche l'arborescence (hors `node_modules/.git/vendor/dist`), lit chaque fichier source
(borné à 256 Ko), et extrait :

- **imports / requires** — JS/TS (`import … from`, `require()`), Python (`import`/`from`), Go
  (blocs d'import) ;
- **déclarations** — `class`, `function`, `interface`, `type`, `def`, `const`, `func`, … ;
- **edges de dépendance** — imports relatifs résolus en fichiers locaux (`local`), les autres en
  `external:<spec>`.

Analyse **regex-based** (pas un vrai parseur AST) : pour un AST complet, utiliser la seam LSP du
harness. Entrées plafonnées (600 symboles), aucune ingestion de fichier entier.

## Activation

Dynamique (session courante) : `cordis_define` → `cordis_run` avec `host.js` en moitié Host.
Câblage durable : empaqueter en npm et monter via `fragment.yml` (cf. `docs/orchestration.md` §6).
