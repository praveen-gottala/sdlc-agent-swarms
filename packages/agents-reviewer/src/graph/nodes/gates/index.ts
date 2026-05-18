/**
 * @module gates
 *
 * Barrel export for modular gate runners.
 * Each file exports a pure function: (inputs) => GateResult[].
 * Composed by deterministic-gates.ts node factory.
 */

export { runM4Gates } from './m4-gates.js';
export { runDriftCheckGates } from './drift-check-gates.js';
export { runRubricGates } from './rubric-gates.js';
