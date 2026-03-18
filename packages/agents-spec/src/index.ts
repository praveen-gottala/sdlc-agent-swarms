// Spec Writer
export type { SpecWriterInput, SpecWriterOutput } from './spec-writer/spec-writer.js';
export {
  SPEC_WRITER_CONTRACT,
  specWriterWork,
  executeSpecWriter,
  registerSpecWriter,
} from './spec-writer/spec-writer.js';

// Task Decomposer
export type { TaskDecomposerInput, TaskDecomposerOutput } from './task-decomposer/task-decomposer.js';
export {
  TASK_DECOMPOSER_CONTRACT,
  taskDecomposerWork,
  executeTaskDecomposer,
  registerTaskDecomposer,
} from './task-decomposer/task-decomposer.js';

// Utilities
export { validateDependencyGraph } from './task-decomposer/validate-graph.js';
export type { GraphNode } from './task-decomposer/validate-graph.js';
