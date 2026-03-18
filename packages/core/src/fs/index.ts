/**
 * @module @agentforge/core/fs
 *
 * Filesystem abstractions and YAML utilities.
 */

export { createRealFs } from './file-system.js';
export type { FileSystem } from './file-system.js';
export { readYaml, writeYaml } from './yaml-utils.js';
