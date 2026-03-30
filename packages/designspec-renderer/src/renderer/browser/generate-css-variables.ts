/**
 * Generates CSS custom properties from RendererTokens.
 * Emits both DesignSpec token variables and the shadcn theme bridge.
 *
 * Lives outside browser/app/ so Jest tests can import it directly.
 */
import { buildTokenMap } from '../token-resolver.js';
import type { RendererTokens } from '../../types/tokens.js';

export function generateCssVariables(tokens: RendererTokens): string {
  const colorMap = buildTokenMap(tokens);

  const lines: string[] = [':root {'];

  // DesignSpec token variables
  for (const [name, hex] of Object.entries(colorMap)) {
    lines.push(`  --${name}: ${hex};`);
  }

  // shadcn theme bridge — maps shadcn CSS vars to DesignSpec tokens
  lines.push('');
  lines.push('  /* shadcn theme bridge */');
  lines.push('  --background: var(--background-primary);');
  lines.push('  --foreground: var(--text-primary);');
  lines.push('  --primary: var(--cta-primary);');
  lines.push('  --primary-foreground: var(--text-on-cta);');
  lines.push('  --secondary: var(--surface-elevated);');
  lines.push('  --secondary-foreground: var(--text-primary);');
  lines.push('  --destructive: var(--error);');
  lines.push('  --destructive-foreground: var(--text-primary);');
  lines.push('  --muted: var(--surface-elevated);');
  lines.push('  --muted-foreground: var(--text-secondary);');
  lines.push('  --accent: var(--surface-elevated);');
  lines.push('  --accent-foreground: var(--text-primary);');
  lines.push('  --border: var(--border-default);');
  lines.push('  --input: var(--border-default);');
  lines.push('  --ring: var(--cta-primary);');
  lines.push('  --card: var(--surface-primary);');
  lines.push('  --card-foreground: var(--text-primary);');
  lines.push('  --popover: var(--surface-elevated);');
  lines.push('  --popover-foreground: var(--text-primary);');

  lines.push('}');
  return lines.join('\n');
}
