/**
 * @module @agentforge/core/state/design-system-reader
 *
 * Pure functions for reading, writing, and validating design system
 * spec files (design-tokens.yaml and brand.yaml).
 */

import * as path from 'node:path';
import { Ok, Err } from '../types/result.js';
import type { Result } from '../types/result.js';
import type { DesignTokensSpec, BrandSpec, ComponentLibrarySpec, ComponentCatalogSpec } from '../types/design-system.js';
import type { FileSystem } from '../fs/file-system.js';
import { readYaml, writeYaml } from '../fs/yaml-utils.js';

/** Path to design-tokens.yaml within a project. */
const DESIGN_TOKENS_PATH = 'agentforge/spec/design-tokens.yaml';

/** Path to brand.yaml within a project. */
const BRAND_PATH = 'agentforge/spec/brand.yaml';

/** Path to component-library.yaml within a project. */
const COMPONENT_LIBRARY_PATH = 'agentforge/spec/component-library.yaml';

/** Error message when design tokens are not configured. */
const MISSING_DESIGN_TOKENS_MSG =
  'Design tokens not found. Run `agentforge init` or `agentforge design-system update` to configure your design system.';

/** Error message when brand spec is not configured. */
const MISSING_BRAND_SPEC_MSG =
  'Brand spec not found. Run `agentforge init` or `agentforge design-system update` to configure your design system.';

/**
 * Load design tokens from agentforge/spec/design-tokens.yaml.
 * Returns Err if the file is missing — design tokens must be explicitly configured.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param fs - FileSystem implementation to use for reading
 * @returns The parsed DesignTokensSpec, or Err if file missing
 */
export const loadDesignTokens = (
  projectRoot: string,
  fs: FileSystem,
): Result<DesignTokensSpec> => {
  const filePath = path.join(projectRoot, DESIGN_TOKENS_PATH);
  if (!fs.exists(filePath)) {
    return Err({
      code: 'INVALID_STATE',
      message: MISSING_DESIGN_TOKENS_MSG,
      recoverable: true,
    });
  }
  return readYaml<DesignTokensSpec>(filePath, fs);
};

/**
 * Load brand spec from agentforge/spec/brand.yaml.
 * Returns Err if the file is missing — brand spec must be explicitly configured.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param fs - FileSystem implementation to use for reading
 * @returns The parsed BrandSpec, or Err if file missing
 */
export const loadBrandSpec = (
  projectRoot: string,
  fs: FileSystem,
): Result<BrandSpec> => {
  const filePath = path.join(projectRoot, BRAND_PATH);
  if (!fs.exists(filePath)) {
    return Err({
      code: 'INVALID_STATE',
      message: MISSING_BRAND_SPEC_MSG,
      recoverable: true,
    });
  }
  return readYaml<BrandSpec>(filePath, fs);
};

/**
 * Save design tokens to agentforge/spec/design-tokens.yaml.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param spec - The DesignTokensSpec to serialize and write
 * @param fs - FileSystem implementation to use for writing
 * @returns Void on success, or an error Result
 */
export const saveDesignTokens = (
  projectRoot: string,
  spec: DesignTokensSpec,
  fs: FileSystem,
): Result<void> => {
  const filePath = path.join(projectRoot, DESIGN_TOKENS_PATH);
  const dir = path.dirname(filePath);
  fs.mkdir(dir);
  return writeYaml(filePath, spec, fs);
};

/**
 * Save brand spec to agentforge/spec/brand.yaml.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param spec - The BrandSpec to serialize and write
 * @param fs - FileSystem implementation to use for writing
 * @returns Void on success, or an error Result
 */
export const saveBrandSpec = (
  projectRoot: string,
  spec: BrandSpec,
  fs: FileSystem,
): Result<void> => {
  const filePath = path.join(projectRoot, BRAND_PATH);
  const dir = path.dirname(filePath);
  fs.mkdir(dir);
  return writeYaml(filePath, spec, fs);
};

/**
 * Load component library spec from agentforge/spec/component-library.yaml.
 * Returns Err if the file is missing — this is optional (not all projects use a preset library).
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param fs - FileSystem implementation to use for reading
 * @returns The parsed ComponentLibrarySpec, or Err if file missing
 */
export const loadComponentLibrary = (
  projectRoot: string,
  fs: FileSystem,
): Result<ComponentLibrarySpec> => {
  const filePath = path.join(projectRoot, COMPONENT_LIBRARY_PATH);
  if (!fs.exists(filePath)) {
    return Err({
      code: 'INVALID_STATE',
      message: 'Component library not configured. Run `agentforge design-system update` and pick from the catalog.',
      recoverable: true,
    });
  }
  return readYaml<ComponentLibrarySpec>(filePath, fs);
};

/**
 * Save component library spec to agentforge/spec/component-library.yaml.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param spec - The ComponentLibrarySpec to serialize and write
 * @param fs - FileSystem implementation to use for writing
 * @returns Void on success, or an error Result
 */
export const saveComponentLibrary = (
  projectRoot: string,
  spec: ComponentLibrarySpec,
  fs: FileSystem,
): Result<void> => {
  const filePath = path.join(projectRoot, COMPONENT_LIBRARY_PATH);
  const dir = path.dirname(filePath);
  fs.mkdir(dir);
  return writeYaml(filePath, spec, fs);
};

/** Path to component-catalog.yaml within a project. */
const COMPONENT_CATALOG_PATH = 'agentforge/spec/component-catalog.yaml';

/**
 * Load component catalog from agentforge/spec/component-catalog.yaml.
 * Returns Err if the file is missing — this is optional.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param fs - FileSystem implementation to use for reading
 * @returns The parsed ComponentCatalogSpec, or Err if file missing
 */
export const loadComponentCatalog = (
  projectRoot: string,
  fs: FileSystem,
): Result<ComponentCatalogSpec> => {
  const filePath = path.join(projectRoot, COMPONENT_CATALOG_PATH);
  if (!fs.exists(filePath)) {
    return Err({
      code: 'INVALID_STATE',
      message: 'Component catalog not found. Create agentforge/spec/component-catalog.yaml to define shared component anatomy.',
      recoverable: true,
    });
  }
  return readYaml<ComponentCatalogSpec>(filePath, fs);
};

/**
 * Save component catalog to agentforge/spec/component-catalog.yaml.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param spec - The ComponentCatalogSpec to serialize and write
 * @param fs - FileSystem implementation to use for writing
 * @returns Void on success, or an error Result
 */
export const saveComponentCatalog = (
  projectRoot: string,
  spec: ComponentCatalogSpec,
  fs: FileSystem,
): Result<void> => {
  const filePath = path.join(projectRoot, COMPONENT_CATALOG_PATH);
  const dir = path.dirname(filePath);
  fs.mkdir(dir);
  return writeYaml(filePath, spec, fs);
};

/** Valid component categories for catalog entries. */
const VALID_CATEGORIES = new Set([
  'layout',
  'data_display',
  'input',
  'feedback',
  'navigation',
  'composite',
]);

/**
 * Validate a ComponentCatalogSpec for internal consistency.
 * Checks that every component has a 'default' state, uses a valid category,
 * and has non-empty anatomy.
 *
 * @param spec - The ComponentCatalogSpec to validate
 * @returns Ok if valid, Err with details if not
 */
export const validateComponentCatalog = (
  spec: ComponentCatalogSpec,
): Result<void> => {
  const errors: string[] = [];

  for (const [name, entry] of Object.entries(spec.components)) {
    // Check valid category
    if (!VALID_CATEGORIES.has(entry.category)) {
      errors.push(`Component "${name}" has invalid category "${entry.category}" — must be one of: ${[...VALID_CATEGORIES].join(', ')}`);
    }

    // Check non-empty anatomy
    if (!entry.anatomy || entry.anatomy.length === 0) {
      errors.push(`Component "${name}" has empty anatomy — at least one slot is required`);
    }

    // Check default state exists
    if (!entry.states || !entry.states['default']) {
      errors.push(`Component "${name}" is missing required "default" state`);
    }
  }

  if (errors.length > 0) {
    return Err({
      code: 'INVALID_STATE',
      message: `Component catalog validation failed:\n${errors.join('\n')}`,
      recoverable: false,
    });
  }

  return Ok(undefined);
};

/**
 * Design tokens in the format consumed by agents-design DesignSurface.
 * Maps the structured DesignTokensSpec to the flat DesignTokens interface.
 */
export interface DesignTokensFlat {
  readonly colors: Readonly<Record<string, string>>;
  readonly typography: Readonly<Record<string, unknown>>;
  readonly spacing: Readonly<Record<string, string>>;
}

/**
 * Convert a DesignTokensSpec to the flat DesignTokens type used by agents-design.
 * Maps primitive colors to colors, typography scale to typography, spacing scale to spacing.
 *
 * @param spec - The structured DesignTokensSpec
 * @returns The flat DesignTokens for backward compatibility
 */
export const toDesignTokens = (spec: DesignTokensSpec): DesignTokensFlat => {
  // Map primitive colors
  const colors: Record<string, string> = { ...spec.colors.primitive };

  // Map typography scale entries
  const typography: Record<string, unknown> = {};
  for (const entry of spec.typography.scale) {
    const fontFamily = spec.typography.font_families[entry.family] ?? entry.family;
    typography[entry.role] = {
      fontSize: entry.size,
      fontWeight: entry.weight,
      fontFamily,
      ...(entry.line_height !== undefined ? { lineHeight: entry.line_height } : {}),
      ...(entry.letter_spacing !== undefined ? { letterSpacing: entry.letter_spacing } : {}),
    };
  }

  // Map spacing scale to named values
  const spacing: Record<string, string> = {};
  for (const value of spec.spacing.scale) {
    spacing[`${value}`] = `${value}px`;
  }

  return { colors, typography, spacing };
};

/**
 * Validate a DesignTokensSpec for internal consistency.
 * Checks that semantic colors reference existing primitives, typography
 * scale entries reference existing font families, and spacing is sorted.
 *
 * @param spec - The DesignTokensSpec to validate
 * @returns Ok if valid, Err with details if not
 */
export const validateDesignTokens = (spec: DesignTokensSpec): Result<void> => {
  const errors: string[] = [];

  // Check semantic colors reference existing primitives
  for (const [role, ref] of Object.entries(spec.colors.semantic)) {
    // Allow raw hex values (starting with #) — they don't need to reference primitives
    if (!ref.startsWith('#') && !(ref in spec.colors.primitive)) {
      errors.push(`Semantic color "${role}" references nonexistent primitive "${ref}"`);
    }
  }

  // Check typography scale entries reference existing font families
  for (const entry of spec.typography.scale) {
    if (!(entry.family in spec.typography.font_families)) {
      errors.push(`Typography scale entry "${entry.role}" references nonexistent font family "${entry.family}"`);
    }
  }

  // Check spacing scale is sorted ascending
  for (let i = 1; i < spec.spacing.scale.length; i++) {
    if (spec.spacing.scale[i] <= spec.spacing.scale[i - 1]) {
      errors.push(`Spacing scale is not sorted ascending: ${spec.spacing.scale[i - 1]} >= ${spec.spacing.scale[i]}`);
      break;
    }
  }

  // Validate component token references resolve to existing semantic/primitive/border names
  if (spec.components) {
    const validColorNames = new Set([
      ...Object.keys(spec.colors.primitive),
      ...Object.keys(spec.colors.semantic),
    ]);
    const validRadiusNames = new Set(Object.keys(spec.borders.radius));
    const SPECIAL_VALUES = new Set(['transparent', 'solid', 'dashed', 'dotted', 'none']);

    for (const [componentName, variants] of Object.entries(spec.components)) {
      if (!variants || typeof variants !== 'object') continue;
      for (const [variantName, tokens] of Object.entries(variants as Record<string, Record<string, unknown>>)) {
        if (!tokens || typeof tokens !== 'object') continue;
        for (const [prop, value] of Object.entries(tokens)) {
          if (typeof value !== 'string') continue;
          // Skip special values, raw hex values, and numeric-like strings
          if (SPECIAL_VALUES.has(value)) continue;
          if (value.startsWith('#')) continue;
          // Check if it's a radius reference
          if (prop === 'radius' || prop === 'border_radius') {
            if (!validRadiusNames.has(value)) {
              errors.push(`Component "${componentName}.${variantName}.${prop}" references nonexistent border radius "${value}"`);
            }
            continue;
          }
          // For color-like properties, check against color names
          if (prop.includes('bg') || prop.includes('text') || prop.includes('color') || prop === 'fill') {
            if (!validColorNames.has(value)) {
              errors.push(`Component "${componentName}.${variantName}.${prop}" references nonexistent color token "${value}"`);
            }
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    return Err({
      code: 'INVALID_STATE',
      message: `Design tokens validation failed:\n${errors.join('\n')}`,
      recoverable: false,
    });
  }

  return Ok(undefined);
};

/**
 * Validate a BrandSpec for internal consistency.
 * Checks wcag_level is valid and duration_base_ms is positive.
 *
 * @param spec - The BrandSpec to validate
 * @returns Ok if valid, Err with details if not
 */
export const validateBrandSpec = (spec: BrandSpec): Result<void> => {
  const errors: string[] = [];

  const validLevels = ['A', 'AA', 'AAA'];
  if (!validLevels.includes(spec.accessibility.wcag_level)) {
    errors.push(`Invalid wcag_level: "${spec.accessibility.wcag_level}" — must be A, AA, or AAA`);
  }

  if (spec.motion_principles.duration_base_ms <= 0) {
    errors.push(`duration_base_ms must be positive, got ${spec.motion_principles.duration_base_ms}`);
  }

  if (errors.length > 0) {
    return Err({
      code: 'INVALID_STATE',
      message: `Brand spec validation failed:\n${errors.join('\n')}`,
      recoverable: false,
    });
  }

  return Ok(undefined);
};
