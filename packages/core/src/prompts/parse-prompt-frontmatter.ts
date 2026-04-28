import { parse } from 'yaml';

/** Parsed frontmatter metadata from a prompt file. */
export interface PromptFrontmatter {
  readonly version: string | undefined;
  readonly purpose: string | undefined;
}

/** Result of parsing a prompt file: metadata + body without frontmatter. */
export interface ParsedPrompt {
  readonly frontmatter: PromptFrontmatter;
  readonly body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)(?:\r?\n)?---\r?\n?/;

const EMPTY_FRONTMATTER: PromptFrontmatter = { version: undefined, purpose: undefined };

/**
 * Parse YAML frontmatter from a markdown prompt file.
 * Returns the parsed metadata and the body content without the frontmatter block.
 * Gracefully handles files without frontmatter.
 */
export function parsePromptFrontmatter(raw: string): ParsedPrompt {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) {
    return { frontmatter: EMPTY_FRONTMATTER, body: raw };
  }

  const yamlBlock = match[1];
  const body = raw.slice(match[0].length);

  if (!yamlBlock.trim()) {
    return { frontmatter: EMPTY_FRONTMATTER, body };
  }

  const parsed = parse(yamlBlock) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== 'object') {
    return { frontmatter: EMPTY_FRONTMATTER, body };
  }

  const version = typeof parsed.version === 'string' ? parsed.version
    : typeof parsed.version === 'number' ? String(parsed.version)
    : undefined;

  const purpose = typeof parsed.purpose === 'string' ? parsed.purpose : undefined;

  return {
    frontmatter: { version, purpose },
    body,
  };
}
