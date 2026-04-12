/**
 * @module @agentforge/cli/utils/open-in-browser
 *
 * Cross-platform utility to open a URL in the default browser.
 */

import { exec } from 'node:child_process';

/** Open a URL in the default browser. Returns true if the browser opened. */
export function openInBrowser(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const cmd = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start'
        : 'xdg-open';
    exec(`${cmd} "${url}"`, (err) => {
      resolve(!err);
    });
  });
}
