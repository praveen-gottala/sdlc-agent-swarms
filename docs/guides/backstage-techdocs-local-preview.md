# Previewing Backstage TechDocs Locally

A practical guide for rendering and sharing Alpha platform documentation **without waiting for Backstage infrastructure to be set up** for your repo.

---

## Context

**Backstage** is the open-source developer portal framework (created by Spotify, donated to the CNCF, Apache 2.0 licensed) that Asurion runs at `https://backstage.asurion.com`.

The Alpha platform's docs are published there as the `hzn-alpha` component, with the source of truth in:

- `hng-alpha-automation/catalog-info.yaml` — Backstage component registration
- `hng-alpha-automation/mkdocs.yml` — TechDocs navigation/config (uses `techdocs-core` plugin)
- `hng-alpha-automation/docs/**/*.md` — the actual markdown content
- `hng-alpha-automation/.github/workflows/publish-docs.yml` — manual publish workflow

You can render the **exact same content** locally, with the same Backstage chrome, **without** running a Backstage instance. This is ideal for:

- Sharing screenshots / a static HTML bundle / a PDF with stakeholders
- Validating docs changes before pushing to the org Backstage instance
- Spinning up TechDocs for a repo that doesn't yet have a `catalog-info.yaml` registered

---

## Option 1 — TechDocs CLI (recommended, closest to real Backstage)

Spotify ships a standalone CLI that renders TechDocs **using the same pipeline** as a real Backstage instance, with full Backstage UI chrome. Perfect for screenshots.

It uses the `mkdocs.yml` + `docs/` structure you already have in `hng-alpha-automation`.

### Quick start (uses Docker, zero local Python setup)

```bash
cd /Users/praveengottala/Documents/AlphaCodebase/hng-alpha-automation

npx @techdocs/cli serve
```

That's it. Opens `http://localhost:3000` with the full Backstage TechDocs UI rendering your existing docs. Screenshots from here look identical to `backstage.asurion.com`.

### Static HTML (shareable as a zip)

```bash
npx @techdocs/cli generate --source-dir . --output-dir ./site
```

Produces a static `site/` folder you can zip and email, or upload to any web host / S3 bucket / SharePoint. Recipients just open `index.html` in any browser.

### Without Docker (if you have Python locally)

```bash
pip install mkdocs-techdocs-core
npx @techdocs/cli serve --no-docker
```

Reference: <https://github.com/backstage/backstage/tree/master/packages/techdocs-cli>

---

## Option 2 — Plain MkDocs (fastest, but no Backstage chrome)

If you only need the *content* and don't care about the Backstage look:

```bash
cd /Users/praveengottala/Documents/AlphaCodebase/hng-alpha-automation

pip install mkdocs mkdocs-techdocs-core
mkdocs serve   # http://localhost:8000
mkdocs build   # outputs ./site/
```

Faster to start, but renders with the default MkDocs/Material theme, not Backstage's. Fine for content validation.

---

## Option 3 — PDF export

TechDocs/Backstage **don't** ship a built-in PDF export, but MkDocs plugins fill the gap.

### Plugin-based (one PDF per build)

Add to `hng-alpha-automation/mkdocs.yml`:

```yaml
plugins:
  - techdocs-core
  - with-pdf:
      output_path: pdf/alpha-docs.pdf
      cover_title: "Horizon Alpha"
      cover_subtitle: "TechDocs"
```

Install and build:

```bash
pip install mkdocs-with-pdf
mkdocs build
# → ./site/pdf/alpha-docs.pdf
```

### Alternatives

- **`mkdocs-print-site-plugin`** — combines all pages into one HTML page; use the browser's *Print → Save as PDF*. Cleaner output than `with-pdf` for some content.
- **Browser print** — just run `npx @techdocs/cli serve`, navigate each page, *Print → Save as PDF*. Zero plugin setup, but tedious for many pages.

> ⚠️ **Don't commit** the PDF plugin to the shared `mkdocs.yml` if `techdocs-core` is the only plugin supported by the org's publish workflow (`asurion-private/pse-github-actions/.github/workflows/backstageDocPush.yaml`). Keep it on a local branch or in a separate `mkdocs.pdf.yml` you only use ad-hoc.

---

## Option 4 — Run real Backstage locally (overkill for this use case)

```bash
npx @backstage/create-app@latest
```

Spins up a full Backstage app you can run with `yarn dev`. You'd then register your `catalog-info.yaml` and point TechDocs at your repo.

**Heavy setup** — needs auth config, a database for catalog persistence, plugin install, etc. Only worth it if you also want to demo the catalog + scaffolder, not just render docs.

---

## Recommended workflow for "share until infra is ready"

| Goal | Command | Output |
|------|---------|--------|
| Take Backstage-styled screenshots | `npx @techdocs/cli serve` | Live preview at `http://localhost:3000` |
| Send a self-contained HTML bundle | `npx @techdocs/cli generate --source-dir . --output-dir ./site` | Zip the `./site` folder, share by email/Slack/SharePoint |
| Generate a PDF | Add `mkdocs-with-pdf` plugin → `mkdocs build` | `./site/pdf/alpha-docs.pdf` |
| Quick content review (no Backstage UI) | `mkdocs serve` | Live preview at `http://localhost:8000` |

---

## Prerequisites cheat sheet

| Tool | Required for | Install |
|------|--------------|---------|
| Node.js (20.x) | `@techdocs/cli` | already installed for Alpha repos |
| Docker | `@techdocs/cli` default mode | Docker Desktop or `colima`/`rancher` |
| Python 3.x + pip | `--no-docker` mode, plain `mkdocs`, PDF plugins | `brew install python` |
| `mkdocs-techdocs-core` | Backstage-faithful rendering without Docker | `pip install mkdocs-techdocs-core` |
| `mkdocs-with-pdf` | PDF export | `pip install mkdocs-with-pdf` |

---

## Rendering a different repo (one without `mkdocs.yml`)

If you want to preview docs for a repo that isn't yet registered in Backstage (e.g. `alpha-microapps`, `hng-alpha-graphql`), scaffold a minimal TechDocs structure:

```
<your-repo>/
├── catalog-info.yaml      # optional for local preview, required for org Backstage
├── mkdocs.yml
└── docs/
    └── index.md
```

Minimal `mkdocs.yml`:

```yaml
site_name: <Your Repo Name>
nav:
  - Home: index.md
plugins:
  - techdocs-core
```

Then run the same `npx @techdocs/cli serve` from that repo's root.

For the `catalog-info.yaml`, mirror `hng-alpha-automation/catalog-info.yaml` — change `metadata.name`, `github.com/project-slug`, and `spec.type` (`service`, `library`, `website`, or `documentation`). Registration in the live Backstage UI is a one-time manual step (Create → Register Existing Component → point at the `catalog-info.yaml` URL).

---

## Useful links

- Backstage docs: <https://backstage.io/docs>
- TechDocs reference: <https://backstage.io/docs/features/techdocs/>
- TechDocs CLI: <https://github.com/backstage/backstage/tree/master/packages/techdocs-cli>
- MkDocs: <https://www.mkdocs.org>
- Asurion Backstage instance: <https://backstage.asurion.com>
- Live Alpha TechDocs: <https://backstage.asurion.com/docs/default/Component/hzn-alpha/>
