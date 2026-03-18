/**
 * @module @agentforge/cli/commands/start
 *
 * The `agentforge start <phase>` command.
 * Validates config, ensures the engine is running, and starts
 * the orchestration engine for the given SDLC phase.
 */

import * as path from 'node:path';
import { readYaml, writeYaml, type FileSystem, realFs } from '../fs-utils.js';
import { successMsg, errorMsg, infoMsg } from '../formatter.js';
import type { ProjectManifest } from '../types.js';
import {
  isEngineRunning,
  spawnEngine,
  createEngineClient,
  getEnginePort,
  type EngineClient,
} from '../engine-client.js';
import { isSetupComplete, setupEngine } from '../engine-setup.js';

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
  clientOverride?: EngineClient,
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

  // Auto-setup: install Python engine dependencies if not done yet
  if (!isSetupComplete(rootDir)) {
    output.write(infoMsg('Engine not found. Setting up... (one-time)\n'));
    const setupResult = await setupEngine(rootDir, (msg) => {
      output.write(infoMsg(`${msg}\n`));
    });
    if (!setupResult.ok) {
      output.write(errorMsg(`Engine setup failed: ${setupResult.error.message}\n`));
      output.write(infoMsg('Run "agentforge setup" for detailed diagnostics.\n'));
      process.exitCode = 1;
      return;
    }
    output.write(successMsg('Engine setup complete.\n'));
  }

  // Check if engine is running, spawn if not
  const pidPath = path.join(rootDir, '.agentforge', 'engine.pid');
  if (!isEngineRunning(pidPath)) {
    output.write(infoMsg('Starting orchestration engine...\n'));
    const spawnResult = await spawnEngine(rootDir, getEnginePort());
    if (!spawnResult.ok) {
      output.write(errorMsg(`Failed to start engine: ${spawnResult.error.message}\n`));
      process.exitCode = 1;
      return;
    }
    output.write(successMsg(`Engine started (PID: ${spawnResult.value.pid}).\n`));
  } else {
    output.write(infoMsg('Engine already running.\n'));
  }

  // Start phase via engine API
  const client = clientOverride ?? createEngineClient();
  const startResult = await client.startPhase(phase, rootDir);
  if (!startResult.ok) {
    output.write(errorMsg(`Failed to start phase: ${startResult.error.message}\n`));
    process.exitCode = 1;
    return;
  }

  // Persist thread ID for approve/abort to reference
  const threadPath = path.join(rootDir, '.agentforge', 'active-thread.yaml');
  writeYaml(
    threadPath,
    { threadId: startResult.value.threadId, phase, startedAt: new Date().toISOString() },
    fileSystem,
  );

  output.write(successMsg(`Phase "${phase}" started (thread: ${startResult.value.threadId}).\n`));
}
