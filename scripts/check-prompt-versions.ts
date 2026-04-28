/**
 * Pre-commit check: fails if a prompt file's content changed without a version bump.
 * Compares staged content against HEAD for .md files in packages/agents-ux/src/prompts/.
 *
 * Exit codes:
 *   0 — all checks pass (or no prompt files changed)
 *   1 — at least one prompt changed without a version bump
 *
 * Usage:
 *   npx tsx scripts/check-prompt-versions.ts
 */

import { execSync } from 'node:child_process';
import { checkVersionBump } from '@agentforge/core';
import type { VersionCheckResult } from '@agentforge/core';

const PROMPT_DIR = 'packages/agents-ux/src/prompts';

function getStagedPromptFiles(): string[] {
  try {
    const output = execSync(
      `git diff --cached --name-only -- "${PROMPT_DIR}/*.md"`,
      { encoding: 'utf-8' },
    ).trim();
    return output ? output.split('\n') : [];
  } catch {
    return [];
  }
}

function getHeadContent(filePath: string): string | null {
  try {
    return execSync(`git show HEAD:${filePath}`, { encoding: 'utf-8' });
  } catch {
    return null;
  }
}

function getStagedContent(filePath: string): string {
  return execSync(`git show :${filePath}`, { encoding: 'utf-8' });
}

function main(): void {
  const files = getStagedPromptFiles();

  if (files.length === 0) {
    process.exit(0);
  }

  const results: VersionCheckResult[] = [];
  let hasFailure = false;

  for (const file of files) {
    const oldContent = getHeadContent(file);
    const newContent = getStagedContent(file);
    const result = checkVersionBump(file, oldContent, newContent);
    results.push(result);

    if (result.status === 'fail') hasFailure = true;
  }

  for (const r of results) {
    const icon = r.status === 'ok' ? '✓' : r.status === 'warn' ? '⚠' : '✗';
    // eslint-disable-next-line no-console
    console.log(`  ${icon} ${r.file}: ${r.message}`);
  }

  if (hasFailure) {
    // eslint-disable-next-line no-console
    console.error('\nPrompt version check failed. Bump the version in frontmatter before committing.');
    process.exit(1);
  }
}

main();
