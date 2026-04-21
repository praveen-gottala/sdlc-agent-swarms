import { resolveSharedComponents } from '../resolve-shared-components.js';
import type { PageEntry } from '@agentforge/core';

describe('resolveSharedComponents', () => {
  it('returns shared TopBar + NavigationTabs for PET-style pages', () => {
    const pages: PageEntry[] = [
      {
        id: 'dashboard',
        name: 'Dashboard',
        description: 'd',
        route: '/',
        status: 'approved',
        components: ['TopBar', 'NavigationTabs', 'Card'],
      },
      {
        id: 'add-expense',
        name: 'Add',
        description: 'a',
        route: '/add',
        status: 'approved',
        components: ['TopBar', 'NavigationTabs', 'Form'],
      },
      {
        id: 'spending-insights',
        name: 'Insights',
        description: 'i',
        route: '/insights',
        status: 'approved',
        components: ['TopBar', 'NavigationTabs', 'Chart'],
      },
    ] as PageEntry[];

    const r = resolveSharedComponents(pages);
    expect(r).not.toBeNull();
    expect(r!.components).toEqual(expect.arrayContaining(['TopBar', 'NavigationTabs']));
    expect(r!.components.length).toBe(2);
    expect(r!.referencePageId).toBe('dashboard');
    expect(r!.regions).toEqual([]);
  });

  it('returns null when fewer than 2 approved page-type screens', () => {
    const one: PageEntry[] = [
      { id: 'a', name: 'A', description: '', route: '/', status: 'approved', components: ['X'] },
    ] as PageEntry[];
    expect(resolveSharedComponents(one)).toBeNull();
  });
});
