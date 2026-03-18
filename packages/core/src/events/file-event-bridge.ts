/**
 * File-based event bridge between TypeScript runtime and Python engine.
 *
 * Events are stored as JSON lines in `.agentforge/events.jsonl`.
 * Each line has a `_bridge_origin` field ("engine" or "ts-runtime") so each
 * side can skip events it produced itself.
 *
 * The read offset is persisted in `.agentforge/ts_offset` for restart
 * resilience.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DomainEventInput } from './domain-events.js';
import type { EventBus } from './event-bus.js';

const EVENTS_FILE = '.agentforge/events.jsonl';
const OFFSET_FILE = '.agentforge/ts_offset';
const BRIDGE_ORIGIN = 'ts-runtime';

/**
 * Write a domain event to the shared JSON lines file.
 */
export function writeEvent(
  projectRoot: string,
  event: DomainEventInput,
): void {
  const eventsPath = path.join(projectRoot, EVENTS_FILE);
  const dir = path.dirname(eventsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const payload = { ...event, _bridge_origin: BRIDGE_ORIGIN };
  fs.appendFileSync(eventsPath, JSON.stringify(payload) + '\n');
}

/**
 * Read new events from the JSON lines file since the last offset,
 * skipping events produced by the TypeScript runtime itself.
 */
export function readNewEvents(
  projectRoot: string,
): DomainEventInput[] {
  const eventsPath = path.join(projectRoot, EVENTS_FILE);
  if (!fs.existsSync(eventsPath)) {
    return [];
  }

  const offset = loadOffset(projectRoot);
  const content = fs.readFileSync(eventsPath, 'utf-8');
  const tail = content.slice(offset);
  const events: DomainEventInput[] = [];

  for (const line of tail.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const data = JSON.parse(trimmed);
      if (data._bridge_origin !== BRIDGE_ORIGIN) {
        // Remove transport-only field before publishing.
        const { _bridge_origin: _, ...event } = data;
        events.push(event as DomainEventInput);
      }
    } catch {
      // Skip malformed lines.
    }
  }

  saveOffset(projectRoot, Buffer.byteLength(content, 'utf-8'));
  return events;
}

/**
 * Start watching the events file and publish incoming events to the bus.
 *
 * Returns a cleanup function to stop watching.
 */
export function startBridgeWatcher(
  projectRoot: string,
  bus: EventBus,
): () => void {
  const eventsPath = path.join(projectRoot, EVENTS_FILE);
  const dir = path.dirname(eventsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // Ensure the file exists.
  if (!fs.existsSync(eventsPath)) {
    fs.writeFileSync(eventsPath, '');
  }

  const watcher = fs.watch(eventsPath, () => {
    const events = readNewEvents(projectRoot);
    for (const event of events) {
      bus.publish(event);
    }
  });

  return () => {
    watcher.close();
  };
}

function loadOffset(projectRoot: string): number {
  const offsetPath = path.join(projectRoot, OFFSET_FILE);
  if (!fs.existsSync(offsetPath)) {
    return 0;
  }
  try {
    return parseInt(fs.readFileSync(offsetPath, 'utf-8').trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function saveOffset(projectRoot: string, offset: number): void {
  const offsetPath = path.join(projectRoot, OFFSET_FILE);
  const dir = path.dirname(offsetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(offsetPath, String(offset));
}
