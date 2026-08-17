# test_runner

Toolset QA pour le rôle **Testeur** — trois tools :

## run_tests

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `path` | string | workspace | répertoire d'exécution |
| `framework` | enum | `auto` | `auto` \| `vitest` \| `jest` \| `pytest` \| `node` |
| `filter` | string | — | pattern de nom de test (`-t` / `--testNamePattern` / `-k`) |
| `timeout_ms` | number | 180000 | cap 600000 |

Détection : `vitest.config.*`, `jest.config.*`, `pytest.ini`/`pyproject.toml`, script `test` du
`package.json`. Retourne `exitCode`, `passed`, stdout/stderr bornés.

## coverage_analyzer

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `path`, `framework`, `timeout_ms` | — | idem | `vitest run --coverage` / `jest --coverage` / `pytest --cov` |

Extrait la table de synthèse (lignes `File | %`, `All files`) dans `summary`.

## run_linter

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `path` | string | workspace | répertoire à linter |
| `tool` | enum | `auto` | `auto` \| `eslint` \| `oxlint` \| `ruff` \| `pylint` |
| `timeout_ms` | number | 180000 | cap 600000 |

Détection par fichiers de config + dépendances `package.json`. Retourne `issues` (estimation par
comptage de mots-clés error/warning/problem).

**Dégradation** : framework/linter non détecté ou CLI manquante → résultat structuré avec `note`,
jamais un crash.

## Activation

Dynamique (session courante) : `cordis_define` → `cordis_run` avec `host.js` en moitié Host.
Câblage durable : empaqueter en npm et monter via `fragment.yml` (cf. `docs/orchestration.md` §6).
