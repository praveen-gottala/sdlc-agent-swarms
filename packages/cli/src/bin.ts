#!/usr/bin/env node
/**
 * Binary entry point for the `agentforge` CLI.
 */
import { createProgram } from './index.js';

const program = createProgram();
program.parseAsync(process.argv);
