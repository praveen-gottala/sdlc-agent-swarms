/**
 * @module figma-preflight.test
 *
 * Unit tests for the Figma preflight check utilities.
 */

import { loadFigmaSession, checkWebSocketServer } from './figma-preflight.js';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

// ============================================================================
// Test fixtures
// ============================================================================

const TEST_DIR = resolve(process.cwd(), '.agentforge-test-preflight');
const TEST_SESSION_PATH = join(TEST_DIR, 'figma-session.json');

const validSession = {
  wsUrl: 'ws://localhost:3055',
  channel: 'test-channel-123',
  connectedAt: new Date().toISOString(),
  documentName: 'Test Doc',
};

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// loadFigmaSession
// ============================================================================

describe('loadFigmaSession', () => {
  it('returns Ok for a valid, fresh session', () => {
    writeFileSync(TEST_SESSION_PATH, JSON.stringify(validSession));
    const result = loadFigmaSession(TEST_SESSION_PATH);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.channel).toBe('test-channel-123');
      expect(result.value.documentName).toBe('Test Doc');
    }
  });

  it('returns Err for a stale session (> maxAgeMs)', () => {
    const staleSession = {
      ...validSession,
      connectedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
    };
    writeFileSync(TEST_SESSION_PATH, JSON.stringify(staleSession));
    const result = loadFigmaSession(TEST_SESSION_PATH, 30 * 60 * 1000); // 30 min max
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('expired');
    }
  });

  it('returns Err for a missing session file', () => {
    const result = loadFigmaSession(join(TEST_DIR, 'nonexistent.json'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('not found');
    }
  });

  it('returns Err for a corrupt session file', () => {
    writeFileSync(TEST_SESSION_PATH, 'not-json!!!');
    const result = loadFigmaSession(TEST_SESSION_PATH);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('parse');
    }
  });

  it('returns Err for session missing required fields', () => {
    writeFileSync(TEST_SESSION_PATH, JSON.stringify({ wsUrl: 'ws://localhost:3055' }));
    const result = loadFigmaSession(TEST_SESSION_PATH);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('missing required fields');
    }
  });

  it('reuses session when < 30 min old', () => {
    const recentSession = {
      ...validSession,
      connectedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago
    };
    writeFileSync(TEST_SESSION_PATH, JSON.stringify(recentSession));
    const result = loadFigmaSession(TEST_SESSION_PATH);
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// checkWebSocketServer
// ============================================================================

describe('checkWebSocketServer', () => {
  it('returns Err for an unreachable server', async () => {
    const result = await checkWebSocketServer('ws://localhost:59999', 2000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('not reachable');
    }
  }, 10000);
});
