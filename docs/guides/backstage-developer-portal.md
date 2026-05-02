# CHIP Developer Portal (Backstage)

CHIP uses [Backstage](https://backstage.io) as its developer portal for documentation navigation, service catalog, and developer onboarding. The portal complements the CHIP dashboard -- Backstage is the **outer loop** (discovery, docs, onboarding) while the dashboard is the **inner loop** (pipeline execution, HITL approvals, design studio).

See [ADR-051](../adrs/ADR-051-backstage-developer-portal.md) for the architectural decision.

---

## Quick Start

```bash
cd backstage
yarn install
yarn dev
```

Opens at **http://localhost:3003**. The CHIP dashboard runs on port 3000 -- these do not conflict.

### Prerequisites

- Node.js 20+
- Yarn (Backstage uses Yarn, not npm)
- Python 3 + pip (for TechDocs generation)
- `pip install mkdocs-techdocs-core`

---

## What the Portal Provides

### TechDocs
All 173+ markdown files under `docs/` are rendered as navigable, searchable documentation via MkDocs. The navigation structure is defined in `mkdocs.yml` at the repository root.

### Service Catalog (Phase 2)
Each package in `packages/` is registered as a Backstage Component with dependency graphs, descriptions, and per-package documentation.

---

## How to Update Documentation

### Adding a new doc file
1. Create the `.md` file in the appropriate `docs/` subdirectory
2. Add the file to the `nav:` section in `mkdocs.yml` at the repository root
3. The portal will render it on the next TechDocs build

### Adding a new package (Phase 2+)
1. Create `catalog-info.yaml` in the package root:
   ```yaml
   apiVersion: backstage.io/v1alpha1
   kind: Component
   metadata:
     name: chip-<package-name>
     description: <description>
     annotations:
       backstage.io/techdocs-ref: dir:.
   spec:
     type: library
     lifecycle: production
     owner: chip-team
     system: chip
     dependsOn:
       - component:default/chip-core
   ```
2. Create `README.md` in the package root with: purpose, usage, dependencies, dev commands
3. Add the `catalog-info.yaml` path to the Location entity in the root `catalog-info.yaml`

### Adding a new ADR
1. Create `docs/adrs/ADR-NNN-short-title.md`
2. Add the entry to the ADRs section in `mkdocs.yml`

---

## Architecture

```
Repository Root
├── backstage/                  # Backstage app (isolated, Yarn workspace)
│   ├── app-config.yaml         # Portal configuration (port 3003)
│   └── packages/
│       ├── app/                # Frontend (React)
│       └── backend/            # Backend (Node.js)
├── catalog-info.yaml           # CHIP System entity for Backstage catalog
├── mkdocs.yml                  # TechDocs navigation tree
└── docs/                       # Markdown files (unchanged, read by both TechDocs and AI agents)
```

### Port Map

| Port | Service |
|------|---------|
| 3000 | CHIP Dashboard (Next.js) |
| 3001 | Langfuse UI |
| 3003 | Backstage Developer Portal |
| 4100 | DesignSpec Renderer (Vite) |
| 5433 | PostgreSQL (CHIP application) |
| 6333 | Qdrant (vector DB) |
| 7007 | Backstage Backend API |

### Key Files

| File | Purpose |
|------|---------|
| `mkdocs.yml` | TechDocs navigation tree -- update when adding/removing docs |
| `catalog-info.yaml` | Backstage catalog root -- System entity + Location references |
| `backstage/app-config.yaml` | Portal configuration (ports, TechDocs, catalog) |
| `docs/index.md` | TechDocs landing page |

---

## For AI Agents (Claude Code, Cursor)

AI agents continue reading raw `.md` files directly from the filesystem. The portal is a view layer -- it does not change file locations, add frontmatter requirements, or alter the markdown content.

**When modifying docs as an agent:**
- Edit the `.md` file directly (as before)
- If you create a new file under `docs/`, add it to `mkdocs.yml` nav
- If you create a new package, create `catalog-info.yaml` + `README.md`
- Do NOT modify files inside `backstage/` unless specifically asked

---

## Troubleshooting

### TechDocs not rendering
- Ensure `mkdocs-techdocs-core` is installed: `pip install mkdocs-techdocs-core`
- Check that `mkdocs.yml` nav references are valid: `mkdocs build --strict` (will fail on broken links)

### Port conflicts
- Dashboard on 3000, Backstage on 3003. If 3003 is taken, change `app.baseUrl` in `backstage/app-config.yaml`

### Backstage can't find catalog
- Verify `catalog.locations.target` in `app-config.yaml` points to `../catalog-info.yaml` (relative to `backstage/`)
