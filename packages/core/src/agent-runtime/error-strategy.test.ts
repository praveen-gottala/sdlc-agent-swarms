import { parseErrorStrategy } from './error-strategy.js';

describe('parseErrorStrategy', () => {
  it('extracts retry max count', () => {
    const strategy = parseErrorStrategy('retry(max=3)');
    expect(strategy.retryMax).toBe(3);
    expect(strategy.notifyHuman).toBe(false);
    expect(strategy.pause).toBe(false);
    expect(strategy.escalate).toBe(false);
  });

  it('detects notify_human', () => {
    const strategy = parseErrorStrategy('notify_human');
    expect(strategy.notifyHuman).toBe(true);
    expect(strategy.retryMax).toBe(0);
  });

  it('detects pause', () => {
    const strategy = parseErrorStrategy('pause');
    expect(strategy.pause).toBe(true);
  });

  it('detects escalate', () => {
    const strategy = parseErrorStrategy('escalate');
    expect(strategy.escalate).toBe(true);
  });

  it('returns all defaults for empty string', () => {
    const strategy = parseErrorStrategy('');
    expect(strategy).toEqual({
      retryMax: 0,
      notifyHuman: false,
      pause: false,
      escalate: false,
    });
  });

  it('parses combined strategy string', () => {
    const strategy = parseErrorStrategy('retry(max=2) then notify_human + pause');
    expect(strategy.retryMax).toBe(2);
    expect(strategy.notifyHuman).toBe(true);
    expect(strategy.pause).toBe(true);
    expect(strategy.escalate).toBe(false);
  });

  it('parses retry with escalate', () => {
    const strategy = parseErrorStrategy('retry(max=1) then escalate');
    expect(strategy.retryMax).toBe(1);
    expect(strategy.escalate).toBe(true);
  });
});
