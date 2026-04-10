/**
 * Jest globalSetup — Integration test gate.
 *
 * Runs before every `nx test agents-ux` invocation (agent or terminal).
 * When e2e tests are included (RUN_E2E_PROOF=true), blocks until the user
 * explicitly confirms. Works in three modes:
 *
 *   Interactive TTY  → prompts y/n in the terminal
 *   Non-interactive  → blocks unless CONFIRM_INTEGRATION=true is also set
 *   E2E not enabled  → prints a one-line skip notice and continues
 */

const readline = require('readline');

module.exports = async function globalSetup() {
  const e2eEnabled = process.env.RUN_E2E_PROOF === 'true';

  if (!e2eEnabled) {
    console.log(
      '\n\x1b[33m[integration-guard]\x1b[0m e2e tests excluded (set RUN_E2E_PROOF=true to include). Unit tests running.\n',
    );
    return;
  }

  // ── E2E is enabled — gate it ──

  const banner = [
    '',
    '\x1b[1m\x1b[33m╔══════════════════════════════════════════════════════════════╗\x1b[0m',
    '\x1b[1m\x1b[33m║          INTEGRATION TEST ALERT — LIVE API CALLS            ║\x1b[0m',
    '\x1b[1m\x1b[33m╠══════════════════════════════════════════════════════════════╣\x1b[0m',
    '\x1b[1m\x1b[33m║\x1b[0m  agents-ux e2e tests will call the Anthropic API.           \x1b[1m\x1b[33m║\x1b[0m',
    '\x1b[1m\x1b[33m║\x1b[0m  Estimated cost: ~$1-3 per full run.                        \x1b[1m\x1b[33m║\x1b[0m',
    '\x1b[1m\x1b[33m║\x1b[0m  Requires: ANTHROPIC_API_KEY with sufficient credits.       \x1b[1m\x1b[33m║\x1b[0m',
    '\x1b[1m\x1b[33m╚══════════════════════════════════════════════════════════════╝\x1b[0m',
    '',
  ].join('\n');

  console.log(banner);

  // Fast-path: explicit confirmation via env var (for CI or scripted runs)
  if (process.env.CONFIRM_INTEGRATION === 'true') {
    console.log('\x1b[32m[integration-guard]\x1b[0m CONFIRM_INTEGRATION=true — proceeding.\n');
    return;
  }

  // Interactive TTY → prompt
  const isTTY = process.stdin.isTTY && process.stdout.isTTY;

  if (isTTY) {
    const answer = await askQuestion('  Run integration tests? (y/N): ');
    if (answer.trim().toLowerCase() !== 'y') {
      console.log('\n\x1b[31m[integration-guard]\x1b[0m Aborted by user.\n');
      process.exit(1);
    }
    console.log('\x1b[32m[integration-guard]\x1b[0m Confirmed — running integration tests.\n');
    return;
  }

  // Non-interactive (agent / piped) → warn but do not exit; unit tests still run
  console.warn(
    '\x1b[33m[integration-guard]\x1b[0m Non-interactive shell — e2e tests need:\n' +
    '    RUN_E2E_PROOF=true CONFIRM_INTEGRATION=true\n',
  );
};

function askQuestion(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
