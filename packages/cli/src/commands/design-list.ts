/**
 * @module @agentforge/cli/commands/design-list
 *
 * The `agentforge design:list` command.
 * Scans `.agentforge/previews/` for design artifacts and displays
 * a summary table with module ID, tool, stages completed, last modified,
 * and component count.
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PREVIEW_DIR_REL } from '@agentforge/core';
import { infoMsg, warnMsg } from '../formatter.js';

// ============================================================================
// Types
// ============================================================================

interface DesignEntry {
  readonly moduleId: string;
  readonly tool: 'figma' | 'penpot' | 'none';
  readonly stagesComplete: number;
  readonly stagesTotal: number;
  readonly lastModified: Date;
  readonly componentCount: number | null;
}

// ============================================================================
// Helpers
// ============================================================================

/** Known stage artifact filenames in pipeline order. */
const STAGE_ARTIFACTS = [
  'research-brief.json',
  'planning-spec.json',
] as const;

/** Design artifacts by tool. */
const DESIGN_ARTIFACTS: Record<string, 'figma' | 'penpot'> = {
  'figma-design.json': 'figma',
  'penpot-design.json': 'penpot',
};

/** Scan a single module directory and extract metadata. */
function scanModule(previewsDir: string, moduleId: string): DesignEntry | null {
  const moduleDir = join(previewsDir, moduleId);
  try {
    const dirStat = statSync(moduleDir);
    if (!dirStat.isDirectory()) return null;
  } catch {
    return null;
  }

  let stagesComplete = 0;
  let lastModified = new Date(0);
  let tool: 'figma' | 'penpot' | 'none' = 'none';
  let componentCount: number | null = null;

  // Check stage artifacts
  for (const artifact of STAGE_ARTIFACTS) {
    const artifactPath = join(moduleDir, artifact);
    if (existsSync(artifactPath)) {
      stagesComplete++;
      const mtime = statSync(artifactPath).mtime;
      if (mtime > lastModified) lastModified = mtime;
    }
  }

  // Check design artifacts (figma or penpot)
  for (const [filename, toolName] of Object.entries(DESIGN_ARTIFACTS)) {
    const artifactPath = join(moduleDir, filename);
    if (existsSync(artifactPath)) {
      stagesComplete++;
      tool = toolName;
      const mtime = statSync(artifactPath).mtime;
      if (mtime > lastModified) lastModified = mtime;

      // Extract component count from design output
      try {
        const data = JSON.parse(readFileSync(artifactPath, 'utf-8')) as Record<string, unknown>;
        const nodeIds = data.figmaNodeIds ?? data.penpotNodeIds ?? data.nodeIds;
        if (nodeIds && typeof nodeIds === 'object') {
          componentCount = Object.keys(nodeIds as Record<string, unknown>).length;
        }
      } catch {
        // Ignore parse errors
      }
      break; // Only one design tool per module
    }
  }

  // If no artifacts found, check if dir has any files
  if (stagesComplete === 0 && lastModified.getTime() === 0) {
    try {
      const files = readdirSync(moduleDir);
      if (files.length === 0) return null;
      // Set lastModified from directory itself
      lastModified = statSync(moduleDir).mtime;
    } catch {
      return null;
    }
  }

  // If planning spec exists, try to get component count from it
  if (componentCount === null) {
    const planningPath = join(moduleDir, 'planning-spec.json');
    if (existsSync(planningPath)) {
      try {
        const data = JSON.parse(readFileSync(planningPath, 'utf-8')) as Record<string, unknown>;
        const tree = data.componentTree;
        if (Array.isArray(tree)) {
          componentCount = tree.length;
        }
      } catch {
        // Ignore
      }
    }
  }

  return {
    moduleId,
    tool,
    stagesComplete,
    stagesTotal: 3,
    lastModified,
    componentCount,
  };
}

// ============================================================================
// Format
// ============================================================================

/** Format a date as YYYY-MM-DD HH:MM. */
function formatDate(date: Date): string {
  if (date.getTime() === 0) return '-';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}`;
}

/** Format the design list as a table. */
function formatDesignTable(entries: readonly DesignEntry[]): string {
  const lines: string[] = [];

  // Header
  const cols = {
    module: 'MODULE ID',
    tool: 'TOOL',
    stages: 'STAGES',
    modified: 'LAST MODIFIED',
    components: 'COMPONENTS',
  };

  const widths = {
    module: Math.max(cols.module.length, ...entries.map(e => e.moduleId.length)),
    tool: Math.max(cols.tool.length, 6),
    stages: cols.stages.length,
    modified: 16,
    components: cols.components.length,
  };

  lines.push(
    `  ${cols.module.padEnd(widths.module)}  ${cols.tool.padEnd(widths.tool)}  ${cols.stages.padEnd(widths.stages)}  ${cols.modified.padEnd(widths.modified)}  ${cols.components}`,
  );
  lines.push(`  ${'─'.repeat(widths.module + widths.tool + widths.stages + widths.modified + widths.components + 8)}`);

  for (const entry of entries) {
    const stageIcon = entry.stagesComplete === entry.stagesTotal
      ? '\x1b[32m✔\x1b[0m'
      : entry.stagesComplete > 0
        ? '\x1b[34m●\x1b[0m'
        : '\x1b[90m○\x1b[0m';

    const toolStr = entry.tool === 'none' ? '\x1b[90m-\x1b[0m' : entry.tool;
    const stagesStr = `${entry.stagesComplete}/${entry.stagesTotal}`;
    const modifiedStr = formatDate(entry.lastModified);
    const compsStr = entry.componentCount !== null ? String(entry.componentCount) : '\x1b[90m-\x1b[0m';

    lines.push(
      `${stageIcon} ${entry.moduleId.padEnd(widths.module)}  ${toolStr.padEnd(widths.tool + (entry.tool === 'none' ? 9 : 0))}  ${stagesStr.padEnd(widths.stages)}  ${modifiedStr.padEnd(widths.modified)}  ${compsStr}`,
    );
  }

  return lines.join('\n');
}

// ============================================================================
// Command
// ============================================================================

/**
 * Execute the design:list command.
 * Scans .agentforge/previews/ and prints a summary table.
 */
export async function designListCommand(
  output: NodeJS.WritableStream = process.stdout,
  options: { projectRoot?: string } = {},
): Promise<void> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const previewsDir = resolve(projectRoot, PREVIEW_DIR_REL);

  if (!existsSync(previewsDir)) {
    output.write(warnMsg('No designs found. Run `agentforge design:figma` or `agentforge design:penpot` first.\n'));
    return;
  }

  // Scan all module directories
  const entries: DesignEntry[] = [];
  try {
    const dirs = readdirSync(previewsDir);
    for (const dir of dirs) {
      const entry = scanModule(previewsDir, dir);
      if (entry) entries.push(entry);
    }
  } catch {
    output.write(warnMsg('Failed to read previews directory.\n'));
    return;
  }

  if (entries.length === 0) {
    output.write(warnMsg('No designs found. Run `agentforge design:figma` or `agentforge design:penpot` first.\n'));
    return;
  }

  // Sort by last modified (newest first)
  entries.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

  output.write(infoMsg(`Found ${entries.length} design(s):\n\n`));
  output.write(formatDesignTable(entries) + '\n');
}
