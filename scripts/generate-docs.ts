// Auto-generates Tier 3 documentation pages from canonical sources.
// Output goes to docs/_generated/ (gitignored, human-only via MkDocs).
//
// Generates:
//   1. current-status.md  - plan progress from execution-plan.md files
//   2. package-index.md   - package table from package.json files
//   3. adr-index.md       - ADR table from docs/adrs/ADR-*.md
//
// Usage: npx tsx scripts/generate-docs.ts

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..');
const OUT_DIR = join(ROOT, 'docs', '_generated');

mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// 1. Current Status — parse active plan execution plans
// ---------------------------------------------------------------------------

function generateCurrentStatus(): string {
  const plansDir = join(ROOT, 'docs', 'plans', 'active');
  const entries: { name: string; done: number; total: number; next: string; link: string }[] = [];

  for (const dir of readdirSync(plansDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const epPath = join(plansDir, dir.name, 'execution-plan.md');
    if (!existsSync(epPath)) continue;

    const content = readFileSync(epPath, 'utf8');
    const title = content.match(/^#\s+(.+)/m)?.[1] ?? dir.name;

    const doneCount = (content.match(/- \[x\]/gi) ?? []).length;
    const pendingCount = (content.match(/- \[ \]/g) ?? []).length;
    const total = doneCount + pendingCount;

    let next = '—';
    const nextMatch = content.match(/- \[ \]\s+(.+)/);
    if (nextMatch) {
      next = nextMatch[1].replace(/\*\*/g, '').substring(0, 60);
      if (nextMatch[1].length > 60) next += '...';
    }

    const link = `plans/active/${dir.name}/execution-plan.md`;
    entries.push({ name: title, done: doneCount, total, next, link });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  const rows = entries.map(e => {
    const pct = e.total > 0 ? Math.round((e.done / e.total) * 100) : 0;
    const bar = progressBar(pct);
    return `| [${e.name}](../${e.link}) | ${e.done}/${e.total} | ${bar} ${pct}% | ${e.next} |`;
  });

  return [
    '# Current Status',
    '',
    '> Auto-generated from `docs/plans/active/*/execution-plan.md` — do not edit manually.',
    `> Last generated: ${new Date().toISOString().split('T')[0]}`,
    '',
    '| Plan | Progress | Bar | Next Task |',
    '|------|----------|-----|-----------|',
    ...rows,
    '',
    `*${entries.length} active plans tracked.*`,
    '',
  ].join('\n');
}

function progressBar(pct: number): string {
  const filled = Math.round(pct / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

// ---------------------------------------------------------------------------
// 2. Package Index — parse packages/*/package.json
// ---------------------------------------------------------------------------

interface PackageInfo {
  name: string;
  version: string;
  description: string;
  private: boolean;
  agentforgeDeps: string[];
}

function generatePackageIndex(): string {
  const pkgsDir = join(ROOT, 'packages');
  const packages: PackageInfo[] = [];

  for (const dir of readdirSync(pkgsDir, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name === 'node_modules' || dir.name === 'stacks') continue;
    const pkgPath = join(pkgsDir, dir.name, 'package.json');
    if (!existsSync(pkgPath)) continue;

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const agentforgeDeps = Object.keys(allDeps)
      .filter((d: string) => d.startsWith('@agentforge/'))
      .sort();

    packages.push({
      name: pkg.name ?? dir.name,
      version: pkg.version ?? '0.0.0',
      description: pkg.description ?? '',
      private: pkg.private === true,
      agentforgeDeps,
    });
  }

  packages.sort((a, b) => a.name.localeCompare(b.name));

  const rows = packages.map(p => {
    const scope = p.private ? 'private' : 'public';
    const deps = p.agentforgeDeps.length > 0
      ? p.agentforgeDeps.map(d => `\`${d.replace('@agentforge/', '')}\``).join(', ')
      : '—';
    return `| \`${p.name}\` | ${p.version} | ${scope} | ${deps} |`;
  });

  return [
    '# Package Index',
    '',
    '> Auto-generated from `packages/*/package.json` — do not edit manually.',
    `> Last generated: ${new Date().toISOString().split('T')[0]}`,
    '',
    '| Package | Version | Scope | @agentforge Dependencies |',
    '|---------|---------|-------|-------------------------|',
    ...rows,
    '',
    `*${packages.length} packages in the monorepo.*`,
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 3. ADR Index — parse docs/adrs/ADR-*.md
// ---------------------------------------------------------------------------

interface AdrInfo {
  number: string;
  title: string;
  status: string;
  date: string;
  file: string;
}

function generateAdrIndex(): string {
  const adrsDir = join(ROOT, 'docs', 'adrs');
  const adrs: AdrInfo[] = [];

  for (const file of readdirSync(adrsDir).filter(f => f.startsWith('ADR-') && f.endsWith('.md'))) {
    const content = readFileSync(join(adrsDir, file), 'utf8');

    const number = file.match(/ADR-(\d+)/)?.[1] ?? '???';
    const titleMatch = content.match(/^#\s+ADR-\d+[^:]*:\s*(.+)/m);
    const title = titleMatch?.[1]?.trim() ?? basename(file, '.md');

    const statusSection = content.match(/^## Status\s*\n+([\s\S]*?)(?=\n## |\n*$)/m);
    let statusText = '';
    if (statusSection) {
      const firstLine = statusSection[1].trim().split('\n')[0];
      const statusMatch = firstLine.match(/^(Accepted|Rejected|Proposed|Superseded|Deprecated|Draft)/i);
      statusText = statusMatch?.[1] ?? firstLine.substring(0, 30);
    }

    const dateSection = content.match(/^## Date\s*\n+(.+)/m);
    const dateText = dateSection?.[1]?.trim() ?? '';

    adrs.push({ number, title, status: statusText, date: dateText, file });
  }

  adrs.sort((a, b) => parseInt(a.number) - parseInt(b.number));

  const rows = adrs.map(a => {
    const statusBadge = a.status
      ? a.status
      : '*unspecified*';
    return `| ${a.number} | [${a.title}](../adrs/${a.file}) | ${statusBadge} | ${a.date || '—'} |`;
  });

  return [
    '# ADR Index',
    '',
    '> Auto-generated from `docs/adrs/ADR-*.md` — do not edit manually.',
    `> Last generated: ${new Date().toISOString().split('T')[0]}`,
    '',
    '| # | Title | Status | Date |',
    '|---|-------|--------|------|',
    ...rows,
    '',
    `*${adrs.length} Architecture Decision Records.*`,
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const statusContent = generateCurrentStatus();
const packageContent = generatePackageIndex();
const adrContent = generateAdrIndex();

writeFileSync(join(OUT_DIR, 'current-status.md'), statusContent);
writeFileSync(join(OUT_DIR, 'package-index.md'), packageContent);
writeFileSync(join(OUT_DIR, 'adr-index.md'), adrContent);

console.log('Generated docs/_generated/:');
console.log(`  current-status.md  (${statusContent.split('\n').length} lines)`);
console.log(`  package-index.md   (${packageContent.split('\n').length} lines)`);
console.log(`  adr-index.md       (${adrContent.split('\n').length} lines)`);
