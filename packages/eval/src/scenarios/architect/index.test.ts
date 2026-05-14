import { loadArchitectScenarios, loadArchitectScenario, ARCHITECT_SCENARIO_IDS } from './index.js';

describe('loadArchitectScenarios', () => {
  it('loads all 3 golden scenarios', () => {
    const scenarios = loadArchitectScenarios();
    expect(scenarios).toHaveLength(3);
  });

  it('each scenario has required fields', () => {
    const scenarios = loadArchitectScenarios();
    for (const s of scenarios) {
      expect(s.id).toBeDefined();
      expect(s.name).toBeDefined();
      expect(s.description).toBeDefined();
      expect(s.contractBundle).toBeDefined();
      expect(s.enrichedRequirement).toBeDefined();
      expect(s.expectedBehavior).toBeDefined();
      expect(typeof s.expectedBehavior.criticShouldPass).toBe('boolean');
    }
  });

  it('scenario IDs match the constant', () => {
    const scenarios = loadArchitectScenarios();
    const ids = scenarios.map((s) => s.id);
    expect(ids).toEqual([...ARCHITECT_SCENARIO_IDS]);
  });
});

describe('loadArchitectScenario', () => {
  it('loads a single scenario by ID', () => {
    const s = loadArchitectScenario('correct-cashpulse');
    expect(s).toBeDefined();
    expect(s!.id).toBe('correct-cashpulse');
    expect(s!.expectedBehavior.criticShouldPass).toBe(true);
  });

  it('returns undefined for unknown ID', () => {
    const s = loadArchitectScenario('nonexistent');
    expect(s).toBeUndefined();
  });

  it('missing-field scenario expects failure on gates 4, 5, 9', () => {
    const s = loadArchitectScenario('missing-field');
    expect(s).toBeDefined();
    expect(s!.expectedBehavior.criticShouldPass).toBe(false);
    expect(s!.expectedBehavior.expectedFailedGates).toEqual(
      expect.arrayContaining(['prd-criterion-coverage', 'entity-reference-integrity', 'adr-completeness']),
    );
  });

  it('contradictory scenario expects failure on gates 2, 3, 6, 7, 9', () => {
    const s = loadArchitectScenario('contradictory');
    expect(s).toBeDefined();
    expect(s!.expectedBehavior.criticShouldPass).toBe(false);
    expect(s!.expectedBehavior.expectedFailedGates).toEqual(
      expect.arrayContaining([
        'dag-acyclic', 'single-writer', 'gap-resolution-completeness',
        'openapi-lint', 'adr-completeness',
      ]),
    );
  });
});
