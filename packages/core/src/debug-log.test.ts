import { debugLog, logDefaults } from './debug-log.js';

describe('debugLog', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    delete process.env.DEBUG;
  });

  it('is a no-op when DEBUG is unset', () => {
    delete process.env.DEBUG;
    debugLog('should not appear');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('writes formatted message to stderr when DEBUG=1', () => {
    process.env.DEBUG = '1';
    debugLog('test message');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('[DEBUG] test message');
  });
});

describe('logDefaults', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    delete process.env.DEBUG;
  });

  it('is a no-op when DEBUG is unset', () => {
    delete process.env.DEBUG;
    logDefaults('ctx', { field: [undefined, 'default'] });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('only logs falsy fields', () => {
    process.env.DEBUG = '1';
    logDefaults('optionToBrand', {
      present: ['has-value', 'fallback'],
      missing: [undefined, 'default-val'],
      empty: ['', 'other-default'],
    });
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy.mock.calls[0][0]).toContain('missing not provided');
    expect(errorSpy.mock.calls[0][0]).toContain('default-val');
    expect(errorSpy.mock.calls[1][0]).toContain('empty not provided');
    expect(errorSpy.mock.calls[1][0]).toContain('other-default');
  });
});
