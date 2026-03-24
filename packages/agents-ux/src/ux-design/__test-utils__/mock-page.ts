/**
 * Shared mock factory for Playwright Page objects.
 * Used by penpot-browser-actions tests and any other test that needs a fake Page.
 */

/** Minimal mock of a Playwright ElementHandle. */
export interface MockElement {
  textContent: jest.Mock;
  click: jest.Mock;
  dblclick: jest.Mock;
}

/** Creates a mock element with optional text content. */
export function createMockElement(text = ''): MockElement {
  return {
    textContent: jest.fn().mockResolvedValue(text),
    click: jest.fn().mockResolvedValue(undefined),
    dblclick: jest.fn().mockResolvedValue(undefined),
  };
}

/** Minimal mock of a Playwright Page, covering the surface used by penpot-browser-actions. */
export interface MockPage {
  goto: jest.Mock;
  locator: jest.Mock;
  screenshot: jest.Mock;
  evaluate: jest.Mock;
  click: jest.Mock;
  fill: jest.Mock;
  keyboard: { type: jest.Mock; press: jest.Mock };
  mouse: { move: jest.Mock; down: jest.Mock; up: jest.Mock };
  waitForSelector: jest.Mock;
  waitForTimeout: jest.Mock;
  $$: jest.Mock;
  $: jest.Mock;
}

/** Creates a fresh mock page. All methods resolve to sensible defaults. */
export function createMockPage(): MockPage {
  const ariaSnapshot = jest.fn().mockResolvedValue('<aria-tree />');
  return {
    goto: jest.fn().mockResolvedValue(undefined),
    locator: jest.fn().mockReturnValue({ ariaSnapshot }),
    screenshot: jest.fn().mockResolvedValue(Buffer.from('fake-png')),
    evaluate: jest.fn().mockResolvedValue(null),
    click: jest.fn().mockResolvedValue(undefined),
    fill: jest.fn().mockResolvedValue(undefined),
    keyboard: {
      type: jest.fn().mockResolvedValue(undefined),
      press: jest.fn().mockResolvedValue(undefined),
    },
    mouse: {
      move: jest.fn().mockResolvedValue(undefined),
      down: jest.fn().mockResolvedValue(undefined),
      up: jest.fn().mockResolvedValue(undefined),
    },
    waitForSelector: jest.fn().mockResolvedValue(undefined),
    waitForTimeout: jest.fn().mockResolvedValue(undefined),
    $$: jest.fn().mockResolvedValue([]),
    $: jest.fn().mockResolvedValue(null),
  };
}
