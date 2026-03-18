/**
 * @module @agentforge/cli/commands/migrate
 *
 * The `agentforge migrate [--dry]` command.
 * Reads version fields from all AgentForge YAML files,
 * applies pending migrations, and updates files.
 */

import * as path from 'node:path';
import { readYaml, writeYaml, type FileSystem, realFs } from '../fs-utils.js';
import { successMsg, infoMsg, errorMsg } from '../formatter.js';

/** A migration transforms data from one version to the next. */
interface Migration {
  readonly from: string;
  readonly to: string;
  readonly transform: (data: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Registry of known migrations. Even if v1.0 has no transforms,
 * the infrastructure exists from day one.
 */
const MIGRATIONS: readonly Migration[] = [
  // Placeholder: no migrations yet for v1.0
];

/** YAML files relative to project root that carry a version field. */
const VERSIONED_FILES = [
  'agentforge.yaml',
  'agentforge/spec/project.yaml',
  'agentforge/spec/pages.yaml',
  'agentforge/spec/api.yaml',
  'agentforge/spec/models.yaml',
];

/**
 * Find pending migrations for a given current version.
 */
function findPendingMigrations(currentVersion: string): readonly Migration[] {
  const pending: Migration[] = [];
  let version = currentVersion;

  for (const migration of MIGRATIONS) {
    if (migration.from === version) {
      pending.push(migration);
      version = migration.to;
    }
  }

  return pending;
}

/**
 * Execute the migrate command.
 */
export async function migrateCommand(
  options: { dry?: boolean },
  rootDir: string,
  fileSystem: FileSystem = realFs,
  output: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  let migrationsApplied = 0;

  for (const relPath of VERSIONED_FILES) {
    const filePath = path.join(rootDir, relPath);

    if (!fileSystem.exists(filePath)) {
      continue;
    }

    const result = readYaml<Record<string, unknown>>(filePath, fileSystem);
    if (!result.ok) {
      output.write(errorMsg(`Failed to read ${relPath}: ${result.error.message}\n`));
      continue;
    }

    const data = result.value;
    const version = typeof data['version'] === 'string' ? data['version'] : '1.0';
    const pending = findPendingMigrations(version);

    if (pending.length === 0) {
      output.write(infoMsg(`${relPath}: v${version} — up to date\n`));
      continue;
    }

    let migrated = data;
    for (const migration of pending) {
      output.write(infoMsg(`${relPath}: v${migration.from} → v${migration.to}\n`));
      migrated = migration.transform(migrated);
      migrationsApplied++;
    }

    if (!options.dry) {
      const writeResult = writeYaml(filePath, migrated, fileSystem);
      if (!writeResult.ok) {
        output.write(errorMsg(`Failed to write ${relPath}: ${writeResult.error.message}\n`));
      }
    }
  }

  if (options.dry) {
    output.write(infoMsg(`Dry run: ${migrationsApplied} migration(s) would be applied.\n`));
  } else if (migrationsApplied === 0) {
    output.write(successMsg('All files are up to date.\n'));
  } else {
    output.write(successMsg(`Applied ${migrationsApplied} migration(s).\n`));
  }
}
