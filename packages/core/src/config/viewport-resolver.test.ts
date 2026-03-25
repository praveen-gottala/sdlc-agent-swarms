import { resolveViewports, STANDARD_BREAKPOINTS_DESKTOP_FIRST, STANDARD_BREAKPOINTS_MOBILE_FIRST } from './viewport-resolver.js';
import type { DesignConfig } from '../types/index.js';

describe('resolveViewports', () => {
  it('returns [1440] when nothing is configured', () => {
    expect(resolveViewports({})).toEqual([1440]);
  });

  it('CLI --width overrides everything', () => {
    const designConfig: DesignConfig = {
      primary_viewport: 1440,
      layout_strategy: 'desktop-first',
      responsive_breakpoints: true,
    };
    expect(resolveViewports({
      cliWidth: 768,
      pageViewports: [390, 768],
      designConfig,
    })).toEqual([768]);
  });

  it('page viewports override manifest config', () => {
    const designConfig: DesignConfig = {
      primary_viewport: 1440,
      layout_strategy: 'desktop-first',
      responsive_breakpoints: true,
    };
    expect(resolveViewports({
      pageViewports: [390, 768],
      designConfig,
    })).toEqual([390, 768]);
  });

  it('responsive_breakpoints: true with desktop-first returns standard desktop breakpoints', () => {
    const designConfig: DesignConfig = {
      primary_viewport: 1440,
      layout_strategy: 'desktop-first',
      responsive_breakpoints: true,
    };
    expect(resolveViewports({ designConfig })).toEqual(STANDARD_BREAKPOINTS_DESKTOP_FIRST);
  });

  it('responsive_breakpoints: true with mobile-first returns standard mobile breakpoints', () => {
    const designConfig: DesignConfig = {
      primary_viewport: 375,
      layout_strategy: 'mobile-first',
      responsive_breakpoints: true,
    };
    expect(resolveViewports({ designConfig })).toEqual(STANDARD_BREAKPOINTS_MOBILE_FIRST);
  });

  it('responsive_breakpoints: explicit array returns that array', () => {
    const designConfig: DesignConfig = {
      primary_viewport: 1440,
      layout_strategy: 'desktop-first',
      responsive_breakpoints: [1440, 768],
    };
    expect(resolveViewports({ designConfig })).toEqual([1440, 768]);
  });

  it('responsive_breakpoints: false returns [primary_viewport]', () => {
    const designConfig: DesignConfig = {
      primary_viewport: 1280,
      layout_strategy: 'desktop-first',
      responsive_breakpoints: false,
    };
    expect(resolveViewports({ designConfig })).toEqual([1280]);
  });

  it('empty page viewports fall through to design config', () => {
    const designConfig: DesignConfig = {
      primary_viewport: 1440,
      layout_strategy: 'desktop-first',
      responsive_breakpoints: [1440, 375],
    };
    expect(resolveViewports({
      pageViewports: [],
      designConfig,
    })).toEqual([1440, 375]);
  });

  it('cliWidth of 0 is ignored (falls through)', () => {
    expect(resolveViewports({ cliWidth: 0 })).toEqual([1440]);
  });

  it('empty responsive_breakpoints array falls back to primary_viewport', () => {
    const designConfig: DesignConfig = {
      primary_viewport: 1024,
      layout_strategy: 'desktop-first',
      responsive_breakpoints: [],
    };
    expect(resolveViewports({ designConfig })).toEqual([1024]);
  });
});
