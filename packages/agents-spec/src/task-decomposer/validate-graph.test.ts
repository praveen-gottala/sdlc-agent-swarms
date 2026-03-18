import { validateDependencyGraph } from './validate-graph.js';

describe('validateDependencyGraph', () => {
  it('accepts empty graph', () => {
    const result = validateDependencyGraph([]);
    expect(result.ok).toBe(true);
  });

  it('accepts linear chain', () => {
    const result = validateDependencyGraph([
      { id: 'a', depends_on: [] },
      { id: 'b', depends_on: ['a'] },
      { id: 'c', depends_on: ['b'] },
    ]);
    expect(result.ok).toBe(true);
  });

  it('accepts diamond dependency', () => {
    const result = validateDependencyGraph([
      { id: 'a', depends_on: [] },
      { id: 'b', depends_on: ['a'] },
      { id: 'c', depends_on: ['a'] },
      { id: 'd', depends_on: ['b', 'c'] },
    ]);
    expect(result.ok).toBe(true);
  });

  it('rejects self-loop', () => {
    const result = validateDependencyGraph([
      { id: 'a', depends_on: ['a'] },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('cycle');
    }
  });

  it('rejects cycle A→B→C→A', () => {
    const result = validateDependencyGraph([
      { id: 'a', depends_on: ['c'] },
      { id: 'b', depends_on: ['a'] },
      { id: 'c', depends_on: ['b'] },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('cycle');
    }
  });

  it('rejects disconnected components with cycle', () => {
    const result = validateDependencyGraph([
      { id: 'a', depends_on: [] },
      { id: 'b', depends_on: [] },
      // Disconnected cycle
      { id: 'x', depends_on: ['y'] },
      { id: 'y', depends_on: ['x'] },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('x');
      expect(result.error.message).toContain('y');
    }
  });
});
