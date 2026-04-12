/**
 * @module @agentforge/cli/utils/prompt-once
 *
 * Single-line user prompt utility using a short-lived readline interface.
 */

import * as readline from 'node:readline';

/**
 * Prompt for a single line using a short-lived readline.
 * Creates and closes a new readline.Interface per call to avoid
 * buffering issues that can consume data intended for subsequent readers.
 */
export function promptOnce(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
  question: string,
): Promise<string> {
  const rl =
    readline.createInterface({ input, output, terminal: false });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
