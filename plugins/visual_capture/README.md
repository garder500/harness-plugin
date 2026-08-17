# visual_capture

Toolset Designer — trois tools :

## visual_capture

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `url` | string | — | URL (http/https) ou chemin local |
| `output_path` | string | — | fichier de sortie (.png recommandé) |
| `width` / `height` | number | 1280 / 720 | viewport |
| `full_page` | boolean | false | capture pleine page |
| `timeout_ms` | number | 120000 | cap 600000 |

Capture headless via `npx -y playwright screenshot`. Vérifie l'existence du fichier produit et
retourne sa taille ; échec → `success: false` + stderr (CLI absente, réseau bloqué…).

## design_tokens_parser

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `path` | string | — | source de tokens |
| `kind` | enum | `auto` | `auto` \| `css` \| `tailwind` \| `json` |

Aplatit en `name = value` : variables CSS `--x: v;`, config Tailwind (approximation regex du bloc
`theme`), JSON style-dictionary (chemins pointés, feuilles scalaires). Borné à 1 Mo / 500 tokens.

## a11y_validator

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `url` | string | — | URL à scanner |
| `output_path` | string | — | rapport JSON (`--save`) |
| `timeout_ms` | number | 120000 | cap 600000 |

Scan axe-core (`npx -y @axe-core/cli … --exit`) : retourne le nombre de violations parsé depuis la
sortie, exit code, et le rapport sauvegardé le cas échéant.

**Dégradation** : CLIs externes (playwright, axe) et réseau requis — toute indisponibilité est
retournée en résultat structuré, jamais en crash.

## Activation

Dynamique (session courante) : `cordis_define` → `cordis_run` avec `host.js` en moitié Host.
Câblage durable : empaqueter en npm et monter via `fragment.yml` (cf. `docs/orchestration.md` §6).
