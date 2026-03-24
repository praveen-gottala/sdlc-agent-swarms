/**
 * @module @agentforge/cli/commands/component-library-presets
 *
 * Catalog of well-known React component libraries with React import mappings.
 * This is a CODE ARCHITECTURE decision — independent of visual theme/colors.
 * The visual theme is handled separately by the LLM-generated design tokens.
 */

import type { ReactComponentMapping } from '@agentforge/core';

/** Supported component library identifiers. */
export type ComponentLibraryId = 'shadcn' | 'mui' | 'chakra' | 'antd' | 'radix' | 'mantine';

/** A component library preset — import mappings + install metadata only. No colors/theme. */
export interface ComponentLibraryPreset {
  readonly id: ComponentLibraryId;
  readonly libraryName: string;
  readonly description: string;
  readonly installHint: string;
  readonly docsUrl: string;
  readonly reactMappings: Record<string, ReactComponentMapping>;
}

/** All 6 component library presets. */
const PRESETS: readonly ComponentLibraryPreset[] = [
  {
    id: 'shadcn',
    libraryName: 'shadcn/ui',
    description: 'Copy-paste components built on Radix + Tailwind. Full ownership of code.',
    installHint: 'npx shadcn-ui@latest init',
    docsUrl: 'https://ui.shadcn.com',
    reactMappings: {
      button: { import_path: '@/components/ui/button', component_name: 'Button', variant_prop: 'variant' },
      card: { import_path: '@/components/ui/card', component_name: 'Card' },
      input: { import_path: '@/components/ui/input', component_name: 'Input' },
      badge: { import_path: '@/components/ui/badge', component_name: 'Badge', variant_prop: 'variant' },
      tabs: { import_path: '@/components/ui/tabs', component_name: 'Tabs' },
      avatar: { import_path: '@/components/ui/avatar', component_name: 'Avatar' },
      progress: { import_path: '@/components/ui/progress', component_name: 'Progress' },
    },
  },
  {
    id: 'mui',
    libraryName: 'MUI v5',
    description: 'Material Design component library. Rich component set, enterprise-proven.',
    installHint: 'npm install @mui/material @emotion/react @emotion/styled',
    docsUrl: 'https://mui.com',
    reactMappings: {
      button: { import_path: '@mui/material/Button', component_name: 'Button', variant_prop: 'variant' },
      card: { import_path: '@mui/material/Card', component_name: 'Card' },
      input: { import_path: '@mui/material/TextField', component_name: 'TextField', variant_prop: 'variant' },
      badge: { import_path: '@mui/material/Chip', component_name: 'Chip', variant_prop: 'variant' },
      tabs: { import_path: '@mui/material/Tabs', component_name: 'Tabs' },
      avatar: { import_path: '@mui/material/Avatar', component_name: 'Avatar' },
      progress: { import_path: '@mui/material/LinearProgress', component_name: 'LinearProgress', variant_prop: 'variant' },
    },
  },
  {
    id: 'chakra',
    libraryName: 'Chakra UI',
    description: 'Accessible component library with style props. Great DX and theming.',
    installHint: 'npm install @chakra-ui/react @emotion/react @emotion/styled framer-motion',
    docsUrl: 'https://chakra-ui.com',
    reactMappings: {
      button: { import_path: '@chakra-ui/react', component_name: 'Button', variant_prop: 'variant' },
      card: { import_path: '@chakra-ui/react', component_name: 'Card' },
      input: { import_path: '@chakra-ui/react', component_name: 'Input', variant_prop: 'variant' },
      badge: { import_path: '@chakra-ui/react', component_name: 'Badge', variant_prop: 'variant' },
      tabs: { import_path: '@chakra-ui/react', component_name: 'Tabs', variant_prop: 'variant' },
      avatar: { import_path: '@chakra-ui/react', component_name: 'Avatar' },
      progress: { import_path: '@chakra-ui/react', component_name: 'Progress' },
    },
  },
  {
    id: 'antd',
    libraryName: 'Ant Design v5',
    description: 'Enterprise UI framework. Comprehensive components for data-dense apps.',
    installHint: 'npm install antd',
    docsUrl: 'https://ant.design',
    reactMappings: {
      button: { import_path: 'antd', component_name: 'Button', variant_prop: 'type' },
      card: { import_path: 'antd', component_name: 'Card' },
      input: { import_path: 'antd', component_name: 'Input' },
      badge: { import_path: 'antd', component_name: 'Tag' },
      tabs: { import_path: 'antd', component_name: 'Tabs' },
      avatar: { import_path: 'antd', component_name: 'Avatar' },
      progress: { import_path: 'antd', component_name: 'Progress' },
    },
  },
  {
    id: 'radix',
    libraryName: 'Radix Themes',
    description: 'Headless-first with optional themes. Maximum accessibility and composability.',
    installHint: 'npm install @radix-ui/themes',
    docsUrl: 'https://www.radix-ui.com',
    reactMappings: {
      button: { import_path: '@radix-ui/themes', component_name: 'Button', variant_prop: 'variant' },
      card: { import_path: '@radix-ui/themes', component_name: 'Card' },
      input: { import_path: '@radix-ui/themes', component_name: 'TextField.Root' },
      badge: { import_path: '@radix-ui/themes', component_name: 'Badge', variant_prop: 'variant' },
      tabs: { import_path: '@radix-ui/themes', component_name: 'Tabs.Root' },
      avatar: { import_path: '@radix-ui/themes', component_name: 'Avatar' },
      progress: { import_path: '@radix-ui/themes', component_name: 'Progress' },
    },
  },
  {
    id: 'mantine',
    libraryName: 'Mantine v7',
    description: 'Full-featured with rich hooks ecosystem. Developer-ergonomic and fast.',
    installHint: 'npm install @mantine/core @mantine/hooks',
    docsUrl: 'https://mantine.dev',
    reactMappings: {
      button: { import_path: '@mantine/core', component_name: 'Button', variant_prop: 'variant' },
      card: { import_path: '@mantine/core', component_name: 'Card' },
      input: { import_path: '@mantine/core', component_name: 'TextInput' },
      badge: { import_path: '@mantine/core', component_name: 'Badge', variant_prop: 'variant' },
      tabs: { import_path: '@mantine/core', component_name: 'Tabs' },
      avatar: { import_path: '@mantine/core', component_name: 'Avatar' },
      progress: { import_path: '@mantine/core', component_name: 'Progress' },
    },
  },
];

/**
 * Get all component library presets.
 */
export function getComponentLibraryPresets(): readonly ComponentLibraryPreset[] {
  return PRESETS;
}

/**
 * Look up a component library preset by its ID.
 * Returns undefined if the ID is not recognized.
 */
export function getComponentLibraryById(id: ComponentLibraryId): ComponentLibraryPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}
