import { join } from 'node:path';
import { loadScenarios, loadScenario, SCENARIO_IDS } from './index.js';

const SCENARIOS_DIR = join(__dirname, '.');

describe('loadScenarios', () => {
  it('loads all 5 scenario YAML files', () => {
    const scenarios = loadScenarios(SCENARIOS_DIR);
    expect(scenarios).toHaveLength(5);
  });

  it('validates each scenario against the Zod schema', () => {
    const scenarios = loadScenarios(SCENARIOS_DIR);
    for (const s of scenarios) {
      expect(s.id).toBeDefined();
      expect(s.rawInput).toBeTruthy();
      expect(['bootstrap', 'evolution']).toContain(s.mode);
      expect(s.maxRounds).toBeGreaterThanOrEqual(1);
      expect(s.expectedBehavior).toBeDefined();
      expect(typeof s.expectedBehavior.expectEscalation).toBe('boolean');
    }
  });

  it('includes all expected scenario IDs', () => {
    const scenarios = loadScenarios(SCENARIOS_DIR);
    const ids = scenarios.map((s) => s.id);
    for (const expected of SCENARIO_IDS) {
      expect(ids).toContain(expected);
    }
  });

  it('parses force-multi-round with maxAnswersPerRound', () => {
    const scenarios = loadScenarios(SCENARIOS_DIR);
    const fmr = scenarios.find((s) => s.id === 'force-multi-round');
    expect(fmr).toBeDefined();
    expect(fmr!.maxAnswersPerRound).toBe(2);
    expect(fmr!.expectedBehavior.expectMultiRound).toBe(true);
  });

  it('parses escalation scenario with maxRounds=1', () => {
    const scenarios = loadScenarios(SCENARIOS_DIR);
    const esc = scenarios.find((s) => s.id === 'escalation');
    expect(esc).toBeDefined();
    expect(esc!.maxRounds).toBe(1);
    expect(esc!.expectedBehavior.expectEscalation).toBe(true);
  });

  it('throws on invalid scenarios directory', () => {
    expect(() => loadScenarios('/nonexistent/path')).toThrow();
  });
});

describe('loadScenario', () => {
  it('returns a single scenario by ID', () => {
    const pomodoro = loadScenario('pomodoro', SCENARIOS_DIR);
    expect(pomodoro).toBeDefined();
    expect(pomodoro!.id).toBe('pomodoro');
    expect(pomodoro!.name).toBe('Pomodoro Timer App');
  });

  it('returns undefined for unknown ID', () => {
    const result = loadScenario('nonexistent', SCENARIOS_DIR);
    expect(result).toBeUndefined();
  });
});
