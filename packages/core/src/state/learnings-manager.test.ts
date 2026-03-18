import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import {
  readLearnings,
  addObservation,
  getActiveLearnings,
  deactivateObservation,
  createLearningsFile,
} from './learnings-manager.js';
import type { AgentLearning } from '../types/agent.js';

describe('learnings-manager', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'af-learnings-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const sampleObservation: Omit<AgentLearning, 'id'> = {
    date: '2026-03-17T10:00:00.000Z',
    source: 'human_feedback_on_task_001',
    learning: 'Use smaller PRs for faster review cycles',
    confidence: 'high',
    taskRef: 'task_001',
    active: true,
  };

  describe('createLearningsFile', () => {
    it('creates an empty learnings file', async () => {
      const result = await createLearningsFile('pr_reviewer', tmpDir);
      expect(result.ok).toBe(true);

      const content = await readFile(join(tmpDir, 'pr_reviewer.yaml'), 'utf-8');
      const data = parse(content);
      expect(data.version).toBe('1.0');
      expect(data.agent_role).toBe('pr_reviewer');
      expect(data.observations).toEqual([]);
    });

    it('is a no-op if file already exists', async () => {
      await createLearningsFile('pr_reviewer', tmpDir);
      await addObservation('pr_reviewer', sampleObservation, tmpDir);

      // Second create should not wipe the file
      const result = await createLearningsFile('pr_reviewer', tmpDir);
      expect(result.ok).toBe(true);

      const readResult = await readLearnings('pr_reviewer', tmpDir);
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        expect(readResult.value).toHaveLength(1);
      }
    });
  });

  describe('readLearnings', () => {
    it('returns empty array when file does not exist', async () => {
      const result = await readLearnings('nonexistent', tmpDir);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('reads back observations after adding', async () => {
      await addObservation('frontend_coder', sampleObservation, tmpDir);

      const result = await readLearnings('frontend_coder', tmpDir);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].id).toBe('obs_001');
        expect(result.value[0].learning).toBe('Use smaller PRs for faster review cycles');
        expect(result.value[0].taskRef).toBe('task_001');
        expect(result.value[0].active).toBe(true);
      }
    });
  });

  describe('addObservation', () => {
    it('assigns incremental IDs', async () => {
      const r1 = await addObservation('frontend_coder', sampleObservation, tmpDir);
      expect(r1.ok).toBe(true);
      if (r1.ok) expect(r1.value.id).toBe('obs_001');

      const r2 = await addObservation(
        'frontend_coder',
        { ...sampleObservation, learning: 'Second learning' },
        tmpDir,
      );
      expect(r2.ok).toBe(true);
      if (r2.ok) expect(r2.value.id).toBe('obs_002');

      const r3 = await addObservation(
        'frontend_coder',
        { ...sampleObservation, learning: 'Third learning' },
        tmpDir,
      );
      expect(r3.ok).toBe(true);
      if (r3.ok) expect(r3.value.id).toBe('obs_003');

      const all = await readLearnings('frontend_coder', tmpDir);
      expect(all.ok).toBe(true);
      if (all.ok) expect(all.value).toHaveLength(3);
    });

    it('creates the directory if it does not exist', async () => {
      const nestedDir = join(tmpDir, 'nested', 'learnings');
      const result = await addObservation('tester', sampleObservation, nestedDir);
      expect(result.ok).toBe(true);
    });
  });

  describe('getActiveLearnings', () => {
    it('returns only active observations', async () => {
      await addObservation('pr_reviewer', { ...sampleObservation, active: true }, tmpDir);
      await addObservation(
        'pr_reviewer',
        { ...sampleObservation, learning: 'Outdated tip', active: false },
        tmpDir,
      );
      await addObservation(
        'pr_reviewer',
        { ...sampleObservation, learning: 'Another active one', active: true },
        tmpDir,
      );

      const result = await getActiveLearnings('pr_reviewer', tmpDir);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value.every((o) => o.active)).toBe(true);
      }
    });

    it('returns empty array when file does not exist', async () => {
      const result = await getActiveLearnings('ghost', tmpDir);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual([]);
    });
  });

  describe('deactivateObservation', () => {
    it('sets an observation to inactive', async () => {
      await addObservation('pr_reviewer', sampleObservation, tmpDir);
      await addObservation(
        'pr_reviewer',
        { ...sampleObservation, learning: 'Keep this active' },
        tmpDir,
      );

      const deactResult = await deactivateObservation('pr_reviewer', 'obs_001', tmpDir);
      expect(deactResult.ok).toBe(true);

      const all = await readLearnings('pr_reviewer', tmpDir);
      expect(all.ok).toBe(true);
      if (all.ok) {
        expect(all.value[0].active).toBe(false);
        expect(all.value[1].active).toBe(true);
      }

      const active = await getActiveLearnings('pr_reviewer', tmpDir);
      expect(active.ok).toBe(true);
      if (active.ok) {
        expect(active.value).toHaveLength(1);
        expect(active.value[0].id).toBe('obs_002');
      }
    });

    it('returns error for nonexistent observation ID', async () => {
      await addObservation('pr_reviewer', sampleObservation, tmpDir);

      const result = await deactivateObservation('pr_reviewer', 'obs_999', tmpDir);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TASK_NOT_FOUND');
      }
    });
  });
});
