/**
 * @module @agentforge/cli/commands/design
 *
 * The `agentforge design <description>` command.
 * Creates a page request and kicks off the design pipeline.
 */

import * as path from 'node:path';
import { readYaml, type FileSystem, realFs } from '../fs-utils.js';
import { successMsg, errorMsg, infoMsg } from '../formatter.js';
import type { ProjectManifest } from '../types.js';
import { createEventBus } from '@agentforge/core';
import { handlePageRequest } from '@agentforge/agents-design';

/**
 * Execute the design command for a given page description.
 */
export async function designCommand(
  description: string,
  rootDir: string,
  fileSystem: FileSystem = realFs,
  output: NodeJS.WritableStream = process.stdout,
): Promise<void> {
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
  output.write(infoMsg(`Design request: ${description}\n`));

  // Create an event bus for this session
  const eventBus = createEventBus();

  // Handle the page request
  const handleResult = handlePageRequest(
    { description, projectRoot: rootDir },
    eventBus,
    fileSystem,
  );

  if (!handleResult.ok) {
    output.write(errorMsg(`Failed to create design request: ${handleResult.error.message}\n`));
    process.exitCode = 1;
    return;
  }

  const { pageId, taskId } = handleResult.value;
  output.write(successMsg(`Design request created\n`));
  output.write(infoMsg(`Page ID: ${pageId}\n`));
  output.write(infoMsg(`Task ID: ${taskId}\n`));
  output.write(infoMsg('PageRequested event published. Design agents will pick it up.\n'));
}
