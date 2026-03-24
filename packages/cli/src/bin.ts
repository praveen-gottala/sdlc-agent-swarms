#!/usr/bin/env node
/**
 * Binary entry point for the `agentforge` CLI.
 *
 * Suppresses the punycode deprecation warning (DEP0040) emitted by
 * transitive dependencies that import Node's built-in punycode module.
 */
const originalEmitWarning = process.emitWarning;
process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
  if (typeof warning === 'string' && warning.includes('punycode')) return;
  if (warning instanceof Error && warning.message.includes('punycode')) return;
  return (originalEmitWarning as (...a: unknown[]) => void).call(process, warning, ...args);
}) as typeof process.emitWarning;

import { createProgram } from './index.js';

const program = createProgram();
program.parseAsync(process.argv);
