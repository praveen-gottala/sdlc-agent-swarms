/**
 * @module @agentforge/cli/commands/setup
 *
 * The `agentforge setup` command.
 * Bootstraps the Python engine environment: creates venv, installs dependencies.
 * Also auto-triggered by `agentforge start` when the engine is not set up.
 */

import { successMsg, errorMsg, infoMsg } from '../formatter.js';
import { checkPrerequisites, setupEngine } from '../engine-setup.js';

/**
 * Execute the setup command.
 */
export async function setupCommand(
  rootDir: string,
  output: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  output.write('\n');
  output.write(infoMsg('AgentForge Engine Setup\n'));
  output.write('\n');

  // Check prerequisites first
  output.write(infoMsg('Checking prerequisites...\n'));
  const status = checkPrerequisites(rootDir);

  for (const check of status.checks) {
    const icon = check.status === 'pass' ? '\x1b[32m PASS \x1b[0m' : '\x1b[31m FAIL \x1b[0m';
    output.write(`  ${icon}  ${check.name.padEnd(25)} ${check.message}\n`);

    if (check.status === 'fail' && check.fixHint) {
      output.write(`          ${'\x1b[90m'}${check.fixHint}${'\x1b[0m'}\n`);
    }
  }
  output.write('\n');

  // If Python or engine source are missing, we can't proceed
  const pythonCheck = status.checks.find((c) => c.name === 'Python');
  const engineCheck = status.checks.find((c) => c.name === 'Engine source');

  if (pythonCheck?.status === 'fail') {
    output.write(errorMsg('Python 3.10+ is required. Install it and try again.\n'));
    output.write('\n');
    process.exitCode = 1;
    return;
  }

  if (engineCheck?.status === 'fail') {
    output.write(errorMsg('Engine source not found. Ensure the repository is complete.\n'));
    output.write('\n');
    process.exitCode = 1;
    return;
  }

  // If everything is already set up, just confirm
  if (status.ready) {
    output.write(successMsg('Engine is already set up and ready.\n'));
    output.write('\n');
    return;
  }

  // Run setup
  output.write(infoMsg('Setting up engine...\n'));
  const result = await setupEngine(rootDir, (msg) => {
    output.write(infoMsg(`${msg}\n`));
  });

  if (!result.ok) {
    output.write('\n');
    output.write(errorMsg(`Setup failed: ${result.error.message}\n`));
    output.write('\n');
    process.exitCode = 1;
    return;
  }

  output.write('\n');
  output.write(successMsg('Engine setup complete.\n'));
  output.write(infoMsg(`  Engine: ${result.value.engineDir}\n`));
  output.write(infoMsg(`  Venv:   ${result.value.venvDir}\n`));
  output.write('\n');
}
