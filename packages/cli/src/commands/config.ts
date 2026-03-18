/**
 * @module @agentforge/cli/commands/config
 *
 * The `agentforge config [key] [value]` command.
 * View or update agentforge.yaml values using dot-notation keys.
 */

import * as path from 'node:path';
import { readYaml, writeYaml, type FileSystem, realFs } from '../fs-utils.js';
import { stringify as stringifyYaml } from 'yaml';
import { successMsg, errorMsg } from '../formatter.js';

/**
 * Get a nested value from an object using a dot-notation key.
 */
function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Set a nested value on an object using a dot-notation key.
 * Returns a shallow clone with the value set.
 */
function setNestedValue(
  obj: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  const parts = key.split('.');
  const result = { ...obj };

  if (parts.length === 1) {
    result[parts[0]] = value;
    return result;
  }

  const [head, ...rest] = parts;
  const child = typeof result[head] === 'object' && result[head] !== null
    ? { ...(result[head] as Record<string, unknown>) }
    : {};

  result[head] = setNestedValue(child, rest.join('.'), value);
  return result;
}

/**
 * Parse a string value into the appropriate type.
 */
function parseValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  const num = Number(raw);
  if (!isNaN(num) && raw.trim() !== '') return num;
  return raw;
}

/**
 * Execute the config command.
 */
export async function configCommand(
  key: string | undefined,
  value: string | undefined,
  rootDir: string,
  fileSystem: FileSystem = realFs,
  output: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  const manifestPath = path.join(rootDir, 'agentforge.yaml');
  const result = readYaml<Record<string, unknown>>(manifestPath, fileSystem);

  if (!result.ok) {
    output.write(errorMsg('No agentforge.yaml found. Run "agentforge init" first.\n'));
    process.exitCode = 1;
    return;
  }

  const manifest = result.value;

  // No key: print entire config
  if (!key) {
    output.write(stringifyYaml(manifest, { lineWidth: 120 }));
    return;
  }

  // Key but no value: print specific value
  if (value === undefined) {
    const current = getNestedValue(manifest, key);
    if (current === undefined) {
      output.write(errorMsg(`Key "${key}" not found in config.\n`));
      process.exitCode = 1;
      return;
    }
    if (typeof current === 'object' && current !== null) {
      output.write(stringifyYaml(current, { lineWidth: 120 }));
    } else {
      output.write(`${current}\n`);
    }
    return;
  }

  // Key and value: update config
  const parsed = parseValue(value);
  const updated = setNestedValue(manifest, key, parsed);

  const writeResult = writeYaml(manifestPath, updated, fileSystem);
  if (!writeResult.ok) {
    output.write(errorMsg(`Failed to write config: ${writeResult.error.message}\n`));
    process.exitCode = 1;
    return;
  }

  output.write(successMsg(`Set ${key} = ${JSON.stringify(parsed)}\n`));
}
