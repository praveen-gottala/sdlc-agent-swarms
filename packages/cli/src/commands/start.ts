/**
 * @module @agentforge/cli/commands/start
 *
 * The `agentforge start <phase>` command.
 * Validates config, checks provider availability, and starts
 * the orchestration engine for the given SDLC phase.
 */

import * as path from 'node:path';
import { readYaml, type FileSystem, realFs } from '../fs-utils.js';
import { successMsg, errorMsg, infoMsg } from '../formatter.js';
import type { ProjectManifest } from '../types.js';

const VALID_PHASES = ['design', 'spec', 'code', 'cicd', 'observe'] as const;
type Phase = (typeof VALID_PHASES)[number];

/**
 * Validate that the given phase string is a known SDLC phase.
 */
function isValidPhase(phase: string): phase is Phase {
  return (VALID_PHASES as readonly string[]).includes(phase);
}

/**
 * Execute the start command for a given phase.
 */
export async function startCommand(
  phase: string,
  rootDir: string,
  fileSystem: FileSystem = realFs,
  output: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  // Validate phase
  if (!isValidPhase(phase)) {
    output.write(errorMsg(`Unknown phase "${phase}". Valid phases: ${VALID_PHASES.join(', ')}\n`));
    process.exitCode = 1;
    return;
  }

  // Load manifest
  const manifestPath = path.join(rootDir, 'agentforge.yaml');
  const result = readYaml<ProjectManifest>(manifestPath, fileSystem);
  if (!result.ok) {
    output.write(errorMsg(`No agentforge.yaml found. Run "agentforge init" first.\n`));
    process.exitCode = 1;
    return;
  }

  const manifest = result.value;
  output.write(infoMsg(`Project: ${manifest.project.name}\n`));
  output.write(infoMsg(`Phase: ${phase}\n`));
  output.write(infoMsg(`Provider: ${manifest.agents.providers.default}\n`));
  output.write(infoMsg(`Max concurrent agents: ${manifest.agents.orchestration.max_concurrent_agents}\n`));
  output.write('\n');

  // In Phase 1, the orchestration engine (Python/LangGraph) would be
  // started here via a subprocess or REST call. For now, we log readiness.
  output.write(successMsg(`Starting ${phase} phase...\n`));
  output.write(infoMsg('Orchestration engine connection not yet implemented.\n'));
}
