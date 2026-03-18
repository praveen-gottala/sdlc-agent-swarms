/**
 * @module @agentforge/core/spec-sync
 *
 * Deterministic spec-vs-code diff tool that runs after every PR merge.
 * Compares the living spec YAML against committed code and either
 * auto-syncs minor deviations or flags significant ones for human review.
 *
 * This agent does NOT use an LLM — it is purely structural comparison.
 */

import { Ok, Err } from '../types/result.js';
import type { Result } from '../types/result.js';
import type { FileSystem } from '../fs/file-system.js';
import type { EventBus } from '../events/event-bus.js';
import type { TaskEntry } from '../types/task.js';
import { readYaml, writeYaml } from '../fs/yaml-utils.js';
import { acquireLock, releaseLock } from '../state/lock-manager.js';
import { loadTasks, saveTasks, addTask } from '../state/task-manager.js';

/** A single deviation between spec and code. */
export interface Deviation {
  readonly kind: 'missing_prop' | 'extra_prop' | 'type_mismatch' | 'new_endpoint' | 'removed_endpoint' | 'method_mismatch' | 'new_field' | 'removed_field' | 'type_changed';
  readonly location: string;
  readonly specValue: string | undefined;
  readonly codeValue: string | undefined;
  readonly description: string;
}

/** A minor deviation that can be auto-synced. */
export interface MinorDeviation extends Deviation {
  readonly severity: 'minor';
}

/** A significant deviation that requires human review. */
export interface SignificantDeviation extends Deviation {
  readonly severity: 'significant';
}

/** Result of categorizing a deviation. */
export type CategorizedDeviation = MinorDeviation | SignificantDeviation;

/** Parsed component prop from a spec file. */
interface SpecProp {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
}

/** Parsed component from a spec file. */
interface SpecComponent {
  readonly id: string;
  readonly name: string;
  readonly props: readonly SpecProp[];
}

/** Parsed endpoint from a spec file. */
interface SpecEndpoint {
  readonly id: string;
  readonly method: string;
  readonly path: string;
}

/** Parsed model field from a spec file. */
interface SpecModelField {
  readonly name: string;
  readonly type: string;
}

/** Parsed model from a spec file. */
interface SpecModel {
  readonly id: string;
  readonly name: string;
  readonly fields: readonly SpecModelField[];
}

/** Parsed prop from a TypeScript interface in code. */
interface CodeProp {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
}

/** Parsed endpoint from a route handler in code. */
interface CodeEndpoint {
  readonly method: string;
  readonly path: string;
}

/** Parsed field from a Prisma model in code. */
interface CodeModelField {
  readonly name: string;
  readonly type: string;
}

const SPEC_SYNC_AGENT_ID = 'agent:spec_sync';
const LOCK_TTL_MS = 300_000; // 5 minutes

/**
 * Extract TypeScript interface props from a code file.
 * Looks for `interface <ComponentName>Props { ... }` blocks.
 */
export const extractPropsFromCode = (
  source: string,
  componentName: string,
): readonly CodeProp[] => {
  const interfacePattern = new RegExp(
    `interface\\s+${componentName}Props\\s*\\{([^}]*)\\}`,
    's',
  );
  const match = source.match(interfacePattern);
  if (!match) return [];

  const body = match[1];
  const props: CodeProp[] = [];
  const propPattern = /(\w+)(\??):\s*([^;]+);/g;
  let propMatch: RegExpExecArray | null;

  while ((propMatch = propPattern.exec(body)) !== null) {
    props.push({
      name: propMatch[1],
      type: propMatch[2] === '?' ? propMatch[3].trim() : propMatch[3].trim(),
      required: propMatch[2] !== '?',
    });
  }

  return props;
};

/**
 * Extract route handler signatures from a code file.
 * Looks for `router.get('/path', ...)` or `app.post('/path', ...)` patterns.
 */
export const extractEndpointsFromCode = (
  source: string,
): readonly CodeEndpoint[] => {
  const endpoints: CodeEndpoint[] = [];
  const pattern = /(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    endpoints.push({
      method: match[1].toUpperCase(),
      path: match[2],
    });
  }

  return endpoints;
};

/**
 * Extract model fields from a Prisma schema file.
 * Looks for `model <ModelName> { ... }` blocks.
 */
export const extractFieldsFromPrisma = (
  source: string,
  modelName: string,
): readonly CodeModelField[] | null => {
  const modelPattern = new RegExp(
    `model\\s+${modelName}\\s*\\{([^}]*)\\}`,
    's',
  );
  const match = source.match(modelPattern);
  if (!match) return null;

  const body = match[1];
  const fields: CodeModelField[] = [];
  const fieldPattern = /^\s+(\w+)\s+(\w+)/gm;
  let fieldMatch: RegExpExecArray | null;

  while ((fieldMatch = fieldPattern.exec(body)) !== null) {
    // Skip Prisma directives like @@map, @@index
    if (fieldMatch[1].startsWith('@@')) continue;
    fields.push({
      name: fieldMatch[1],
      type: fieldMatch[2],
    });
  }

  return fields;
};

/**
 * Parse component spec from a YAML-parsed object.
 */
const parseComponentSpec = (raw: unknown): readonly SpecComponent[] => {
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;
  const components = obj['components'];
  if (!Array.isArray(components)) return [];

  return components.map((c: Record<string, unknown>) => ({
    id: String(c['id'] ?? ''),
    name: String(c['name'] ?? ''),
    props: Array.isArray(c['props'])
      ? c['props'].map((p: Record<string, unknown>) => ({
          name: String(p['name'] ?? ''),
          type: String(p['type'] ?? ''),
          required: Boolean(p['required']),
        }))
      : [],
  }));
};

/**
 * Parse API spec from a YAML-parsed object.
 */
const parseApiSpec = (raw: unknown): readonly SpecEndpoint[] => {
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;
  const endpoints = obj['endpoints'];
  if (!Array.isArray(endpoints)) return [];

  return endpoints.map((e: Record<string, unknown>) => ({
    id: String(e['id'] ?? ''),
    method: String(e['method'] ?? ''),
    path: String(e['path'] ?? ''),
  }));
};

/**
 * Parse models spec from a YAML-parsed object.
 */
const parseModelsSpec = (raw: unknown): readonly SpecModel[] => {
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;
  const models = obj['models'];
  if (!Array.isArray(models)) return [];

  return models.map((m: Record<string, unknown>) => ({
    id: String(m['id'] ?? ''),
    name: String(m['name'] ?? ''),
    fields: Array.isArray(m['fields'])
      ? m['fields'].map((f: Record<string, unknown>) => ({
          name: String(f['name'] ?? ''),
          type: String(f['type'] ?? ''),
        }))
      : [],
  }));
};

/**
 * Compare component props between spec and code.
 */
const diffComponentProps = (
  componentName: string,
  specProps: readonly SpecProp[],
  codeProps: readonly CodeProp[],
): readonly Deviation[] => {
  const deviations: Deviation[] = [];
  const codePropMap = new Map(codeProps.map((p) => [p.name, p]));
  const specPropMap = new Map(specProps.map((p) => [p.name, p]));

  // Props in spec but missing from code — this is unusual (code should have what spec says)
  for (const sp of specProps) {
    const cp = codePropMap.get(sp.name);
    if (!cp) {
      deviations.push({
        kind: 'missing_prop',
        location: `${componentName}.props.${sp.name}`,
        specValue: sp.name,
        codeValue: undefined,
        description: `Prop "${sp.name}" exists in spec but not in code`,
      });
    } else if (sp.type !== cp.type) {
      deviations.push({
        kind: 'type_mismatch',
        location: `${componentName}.props.${sp.name}`,
        specValue: sp.type,
        codeValue: cp.type,
        description: `Prop "${sp.name}" type mismatch: spec="${sp.type}", code="${cp.type}"`,
      });
    }
  }

  // Props in code but missing from spec (code added extras)
  for (const cp of codeProps) {
    if (!specPropMap.has(cp.name)) {
      deviations.push({
        kind: 'extra_prop',
        location: `${componentName}.props.${cp.name}`,
        specValue: undefined,
        codeValue: cp.name,
        description: `Prop "${cp.name}" exists in code but not in spec`,
      });
    }
  }

  return deviations;
};

/**
 * Compare API endpoints between spec and code.
 */
const diffEndpoints = (
  specEndpoints: readonly SpecEndpoint[],
  codeEndpoints: readonly CodeEndpoint[],
): readonly Deviation[] => {
  const deviations: Deviation[] = [];
  const codeByPath = new Map(codeEndpoints.map((e) => [e.path, e]));
  const specByPath = new Map(specEndpoints.map((e) => [e.path, e]));

  for (const se of specEndpoints) {
    const ce = codeByPath.get(se.path);
    if (!ce) {
      deviations.push({
        kind: 'removed_endpoint',
        location: `api:${se.method} ${se.path}`,
        specValue: `${se.method} ${se.path}`,
        codeValue: undefined,
        description: `Endpoint ${se.method} ${se.path} exists in spec but not in code`,
      });
    } else if (se.method !== ce.method) {
      deviations.push({
        kind: 'method_mismatch',
        location: `api:${se.path}`,
        specValue: se.method,
        codeValue: ce.method,
        description: `Endpoint ${se.path} method mismatch: spec="${se.method}", code="${ce.method}"`,
      });
    }
  }

  for (const ce of codeEndpoints) {
    if (!specByPath.has(ce.path)) {
      deviations.push({
        kind: 'new_endpoint',
        location: `api:${ce.method} ${ce.path}`,
        specValue: undefined,
        codeValue: `${ce.method} ${ce.path}`,
        description: `Endpoint ${ce.method} ${ce.path} exists in code but not in spec`,
      });
    }
  }

  return deviations;
};

/**
 * Compare data model fields between spec and Prisma schema.
 */
const diffModelFields = (
  modelName: string,
  specFields: readonly SpecModelField[],
  codeFields: readonly CodeModelField[],
): readonly Deviation[] => {
  const deviations: Deviation[] = [];
  const codeFieldMap = new Map(codeFields.map((f) => [f.name, f]));
  const specFieldMap = new Map(specFields.map((f) => [f.name, f]));

  for (const sf of specFields) {
    const cf = codeFieldMap.get(sf.name);
    if (!cf) {
      deviations.push({
        kind: 'removed_field',
        location: `${modelName}.${sf.name}`,
        specValue: sf.name,
        codeValue: undefined,
        description: `Field "${sf.name}" exists in spec but not in Prisma schema`,
      });
    } else if (sf.type !== cf.type) {
      deviations.push({
        kind: 'type_changed',
        location: `${modelName}.${sf.name}`,
        specValue: sf.type,
        codeValue: cf.type,
        description: `Field "${sf.name}" type mismatch: spec="${sf.type}", code="${cf.type}"`,
      });
    }
  }

  for (const cf of codeFields) {
    if (!specFieldMap.has(cf.name)) {
      deviations.push({
        kind: 'new_field',
        location: `${modelName}.${cf.name}`,
        specValue: undefined,
        codeValue: cf.name,
        description: `Field "${cf.name}" exists in Prisma schema but not in spec`,
      });
    }
  }

  return deviations;
};

/**
 * Categorize a deviation as minor or significant.
 *
 * Minor (auto-syncable): extra props, utility functions, type mismatches on props.
 * Significant (human review): new/removed endpoints, new/removed fields, method changes.
 */
export const categorizeDeviation = (
  deviation: Deviation,
): CategorizedDeviation => {
  const minorKinds: ReadonlySet<Deviation['kind']> = new Set([
    'extra_prop',
    'type_mismatch',
  ]);

  if (minorKinds.has(deviation.kind)) {
    return { ...deviation, severity: 'minor' as const };
  }
  return { ...deviation, severity: 'significant' as const };
};

/**
 * Diff a component spec file against committed code files.
 * Returns all deviations found.
 */
export const diffSpecVsCode = (
  specFile: string,
  codeFiles: readonly string[],
  fs: FileSystem,
): Result<readonly Deviation[]> => {
  const specResult = readYaml<unknown>(specFile, fs);
  if (!specResult.ok) return specResult as Result<never>;

  const allDeviations: Deviation[] = [];

  // Detect spec type based on content
  const specData = specResult.value as Record<string, unknown>;

  // Component spec comparison
  if (specData['components']) {
    const specComponents = parseComponentSpec(specData);
    for (const comp of specComponents) {
      for (const codeFile of codeFiles) {
        const readResult = fs.readFile(codeFile);
        if (!readResult.ok) continue;

        const codeProps = extractPropsFromCode(readResult.value, comp.name);
        if (codeProps.length === 0 && comp.props.length === 0) continue;
        if (codeProps.length === 0) continue; // Code file doesn't contain this component

        const propDeviations = diffComponentProps(comp.name, comp.props, codeProps);
        allDeviations.push(...propDeviations);
      }
    }
  }

  // API spec comparison
  if (specData['endpoints']) {
    const specEndpoints = parseApiSpec(specData);
    for (const codeFile of codeFiles) {
      const readResult = fs.readFile(codeFile);
      if (!readResult.ok) continue;

      const codeEndpoints = extractEndpointsFromCode(readResult.value);
      if (codeEndpoints.length === 0) continue;

      const endpointDeviations = diffEndpoints(specEndpoints, codeEndpoints);
      allDeviations.push(...endpointDeviations);
    }
  }

  // Data model spec comparison (only if Prisma schema exists)
  if (specData['models']) {
    const specModels = parseModelsSpec(specData);
    for (const codeFile of codeFiles) {
      const readResult = fs.readFile(codeFile);
      if (!readResult.ok) continue;

      for (const model of specModels) {
        const codeFields = extractFieldsFromPrisma(readResult.value, model.name);
        if (codeFields === null) continue; // Model not in this Prisma file

        const fieldDeviations = diffModelFields(model.name, model.fields, codeFields);
        allDeviations.push(...fieldDeviations);
      }
    }
  }

  return Ok(allDeviations);
};

/**
 * Apply minor (auto-syncable) deviations to a spec file.
 * Acquires a write lock, updates the spec YAML, and releases the lock.
 */
export const applyMinorSync = (
  specFile: string,
  deviations: readonly MinorDeviation[],
  projectRoot: string,
  lockDir: string,
  fs: FileSystem,
): Result<string> => {
  if (deviations.length === 0) return Ok('No deviations to sync');

  // Acquire write lock
  const lockResult = acquireLock(specFile, SPEC_SYNC_AGENT_ID, lockDir, LOCK_TTL_MS, fs);
  if (!lockResult.ok) return lockResult as Result<never>;

  try {
    const specResult = readYaml<Record<string, unknown>>(specFile, fs);
    if (!specResult.ok) {
      releaseLock(specFile, SPEC_SYNC_AGENT_ID, lockDir, fs);
      return specResult as Result<never>;
    }

    const specData = { ...specResult.value };

    // Apply extra_prop deviations: add missing props to component spec
    if (specData['components'] && Array.isArray(specData['components'])) {
      const components = [...specData['components']] as Record<string, unknown>[];
      for (const dev of deviations) {
        if (dev.kind === 'extra_prop') {
          const [componentName, , propName] = dev.location.split('.');
          const comp = components.find(
            (c) => c['name'] === componentName,
          );
          if (comp && Array.isArray(comp['props'])) {
            const props = [...comp['props']] as Record<string, unknown>[];
            props.push({
              name: propName,
              type: 'unknown',
              required: false,
            });
            comp['props'] = props;
          }
        }
      }
      specData['components'] = components;
    }

    // Update last_updated_by
    specData['last_updated_by'] = SPEC_SYNC_AGENT_ID;
    specData['last_updated'] = new Date().toISOString();

    const writeResult = writeYaml(specFile, specData, fs);
    if (!writeResult.ok) {
      releaseLock(specFile, SPEC_SYNC_AGENT_ID, lockDir, fs);
      return writeResult as Result<never>;
    }

    const descriptions = deviations.map((d) => d.description).join(', ');
    const commitMessage = `[agentforge:spec_sync] auto-sync: ${descriptions}`;

    // Release lock
    releaseLock(specFile, SPEC_SYNC_AGENT_ID, lockDir, fs);

    return Ok(commitMessage);
  } catch {
    releaseLock(specFile, SPEC_SYNC_AGENT_ID, lockDir, fs);
    return Err({
      code: 'INVALID_STATE' as const,
      message: 'Unexpected error during spec sync',
      recoverable: false,
      agentId: SPEC_SYNC_AGENT_ID,
    });
  }
};

/**
 * Flag a significant deviation by emitting a SpecDriftDetected event
 * and creating a clarification task in agentforge.tasks.yaml.
 */
export const flagSignificantDeviation = (
  deviation: SignificantDeviation,
  specFile: string,
  projectRoot: string,
  eventBus: EventBus,
  fs: FileSystem,
): Result<string> => {
  // Emit SpecDriftDetected event
  eventBus.publish({
    type: 'SpecDriftDetected',
    specFile,
    deviations: [deviation.description],
    severity: 'significant',
    timestamp: Date.now(),
  });

  // Create a clarification task
  const tasksResult = loadTasks(projectRoot, fs);
  if (!tasksResult.ok) return tasksResult as Result<never>;

  const taskId = `task_specsync_${Date.now()}`;
  const newTask: TaskEntry = {
    id: taskId,
    title: `Spec drift: ${deviation.description}`,
    phase: 'spec',
    agent: 'spec_sync',
    status: 'pending',
    depends_on: [],
    spec_ref: specFile,
    branch: null,
    pr_number: null,
    cost_usd: 0,
    tokens_used: 0,
    attempts: 0,
    max_attempts: 1,
    hitl_status: 'awaiting_approval',
    hitl_channel: null,
  };

  const addResult = addTask(tasksResult.value, newTask);
  if (!addResult.ok) return addResult as Result<never>;

  const saveResult = saveTasks(projectRoot, addResult.value, fs);
  if (!saveResult.ok) return saveResult as Result<never>;

  return Ok(taskId);
};
