import { join } from 'node:path';
import { loadSpineScenarios, loadSpineScenario, SPINE_SCENARIO_IDS } from './index.js';

const SCENARIOS_DIR = join(__dirname, '..');

describe('loadSpineScenarios', () => {
  it('loads both spine eval scenarios from multi-document YAML', () => {
    const scenarios = loadSpineScenarios(SCENARIOS_DIR);
    expect(scenarios).toHaveLength(2);
  });

  it('validates each scenario against SpineEvalScenarioSchema', () => {
    const scenarios = loadSpineScenarios(SCENARIOS_DIR);
    for (const s of scenarios) {
      expect(s.id).toBeDefined();
      expect(s.name).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(['greenfield', 'brownfield']).toContain(s.path);
      expect(s.clarifier.fixtureEnrichedRequirementPath).toBeTruthy();
      expect(['greenfield', 'brownfield']).toContain(s.architect.mode);
      expect(s.architect.taskSelector).toBeDefined();
      expect(s.expectations.length).toBeGreaterThan(0);
    }
  });

  it('includes all expected spine scenario IDs', () => {
    const scenarios = loadSpineScenarios(SCENARIOS_DIR);
    const ids = scenarios.map((s) => s.id);
    for (const expected of SPINE_SCENARIO_IDS) {
      expect(ids).toContain(expected);
    }
  });

  it('parses greenfield scenario correctly', () => {
    const scenarios = loadSpineScenarios(SCENARIOS_DIR);
    const gf = scenarios.find((s) => s.id === 'spine-cashpulse-greenfield');
    expect(gf).toBeDefined();
    expect(gf!.path).toBe('greenfield');
    expect(gf!.architect.mode).toBe('greenfield');
    expect(gf!.architect.taskSelector.taskMode).toBe('NEW');
    expect(gf!.architect.existingDesignSpecPaths).toBeUndefined();
  });

  it('parses brownfield scenario with existing design spec paths', () => {
    const scenarios = loadSpineScenarios(SCENARIOS_DIR);
    const bf = scenarios.find((s) => s.id === 'spine-cashpulse-brownfield');
    expect(bf).toBeDefined();
    expect(bf!.path).toBe('brownfield');
    expect(bf!.architect.mode).toBe('brownfield');
    expect(bf!.architect.taskSelector.taskMode).toBe('MODIFY');
    expect(bf!.architect.existingDesignSpecPaths).toBeDefined();
    expect(Object.keys(bf!.architect.existingDesignSpecPaths!).length).toBeGreaterThan(0);
  });

  it('throws on invalid scenarios directory', () => {
    expect(() => loadSpineScenarios('/nonexistent/path')).toThrow();
  });
});

describe('loadSpineScenario', () => {
  it('returns a single scenario by ID', () => {
    const gf = loadSpineScenario('spine-cashpulse-greenfield', SCENARIOS_DIR);
    expect(gf).toBeDefined();
    expect(gf!.id).toBe('spine-cashpulse-greenfield');
    expect(gf!.name).toContain('Greenfield');
  });

  it('returns undefined for unknown ID', () => {
    const result = loadSpineScenario('nonexistent', SCENARIOS_DIR);
    expect(result).toBeUndefined();
  });
});
