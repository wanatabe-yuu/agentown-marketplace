# agentown-marketplace

Worlds for [Agentown](https://agentown.site). A world is a whole organization in one YAML file: departments, jobs, permissions, the first agents and the 3D office. Agentown installs list them under **Create world → Marketplace**; [agentown.site/marketplace](https://agentown.site/marketplace/) shows them too. How to write one: [agentown.site/worlds](https://agentown.site/worlds/).

| Path | What it is |
|---|---|
| `worlds/<id>.yaml` | **Official** worlds, reviewed here by pull request. The file name is the world's `meta.id`. |
| `verified.json` | Community worlds the maintainer has read: `[{ "repo": "owner/name", "sha256": "…" }]`. |
| `index.json` | Generated: every listed world with its pinned URL and sha256. Installs read `https://raw.githubusercontent.com/wanatabe-yuu/agentown-marketplace/main/index.json`. |
| `scripts/build-index.mjs` | Builds `index.json`; the **Index** workflow runs it every 30 minutes and commits only when it changed. |

## Publish a world

1. Put it at the root of a **public** GitHub repository as `agentown.world.yaml` (at most 256 KB).
2. Add the topic `agentown-world` to that repository.

Within about 30 minutes it is listed as **Unverified**, pinned to the commit it was read from. An install downloads exactly that file and checks its sha256.

## Get it verified

Open a pull request here that adds your repository and the file's sha256 (`sha256sum agentown.world.yaml`) to `verified.json`. Only the maintainer merges these, after reading the world. A later commit that changes the file drops the badge until it is reviewed again.

To propose an **official** world, open a pull request that adds `worlds/<id>.yaml`.

## Build the index locally

```bash
npm ci
npm run index                          # official worlds only
GITHUB_TOKEN=<token> npm run index     # with community worlds
```
