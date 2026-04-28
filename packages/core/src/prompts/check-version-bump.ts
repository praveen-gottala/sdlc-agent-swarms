import { parsePromptFrontmatter } from './parse-prompt-frontmatter.js';

export interface VersionCheckResult {
  readonly file: string;
  readonly status: 'ok' | 'fail' | 'warn';
  readonly message: string;
}

/** Compare old and new prompt file content, check if version was bumped when body changed. */
export function checkVersionBump(
  filePath: string,
  oldContent: string | null,
  newContent: string,
): VersionCheckResult {
  const newParsed = parsePromptFrontmatter(newContent);
  const newVersion = newParsed.frontmatter.version;

  if (!oldContent) {
    return { file: filePath, status: 'ok', message: 'new file' };
  }

  if (!newVersion) {
    return { file: filePath, status: 'warn', message: 'no frontmatter version — consider adding one' };
  }

  const oldParsed = parsePromptFrontmatter(oldContent);
  const oldVersion = oldParsed.frontmatter.version;

  const bodyChanged = oldParsed.body !== newParsed.body;
  const versionChanged = oldVersion !== newVersion;

  if (!bodyChanged) {
    return { file: filePath, status: 'ok', message: 'content unchanged' };
  }

  if (bodyChanged && !versionChanged) {
    return {
      file: filePath,
      status: 'fail',
      message: `content changed but version is still ${oldVersion ?? 'unset'} — bump the version in frontmatter`,
    };
  }

  return { file: filePath, status: 'ok', message: `${oldVersion} → ${newVersion}` };
}
