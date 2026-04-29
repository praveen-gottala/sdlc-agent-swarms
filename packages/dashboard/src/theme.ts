'use client';

import { createTheme, MantineColorsTuple } from '@mantine/core';

const chipBlue: MantineColorsTuple = [
  '#e8f4ff',
  '#d1e5fa',
  '#a3c9f5',
  '#73abf0',
  '#4d92ec',
  '#3b82f6',
  '#2563eb',
  '#1d4ed8',
  '#1e40af',
  '#1e3a8a',
];

const chipPurple: MantineColorsTuple = [
  '#f3e8ff',
  '#e9d5ff',
  '#d8b4fe',
  '#c084fc',
  '#a855f7',
  '#8b5cf6',
  '#7c3aed',
  '#6d28d9',
  '#5b21b6',
  '#4c1d95',
];

const chipDark: MantineColorsTuple = [
  '#e2e8f0',
  '#94a3b8',
  '#64748b',
  '#475569',
  '#2d2f42',
  '#252736',
  '#1a1b2e',
  '#13141f',
  '#0f1117',
  '#0a0b0f',
];

export const chipTheme = createTheme({
  primaryColor: 'chip-blue',
  colors: {
    'chip-blue': chipBlue,
    'chip-purple': chipPurple,
    'chip-dark': chipDark,
  },
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  fontFamilyMonospace: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
  headings: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
    fontWeight: '600',
  },
  defaultRadius: 'md',
  cursorType: 'pointer',
  components: {
    Button: {
      defaultProps: {
        variant: 'filled',
      },
    },
    Card: {
      defaultProps: {
        withBorder: true,
      },
    },
  },
});
