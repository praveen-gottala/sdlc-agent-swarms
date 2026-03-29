/**
 * @module @agentforge/agents-ux/prompts/prompt-template-builder
 *
 * Renders design token values into prompt template placeholders.
 * Replaces hardcoded pixel values with dynamic values from DesignTokensSpec.
 */

import type { DesignTokensSpec } from '@agentforge/core';

const VISUAL_WEIGHT_MAP: Record<string, string> = {
  'heading-1': 'Maximum — full color, bold',
  'heading-2': 'High — full color, bold',
  'heading-3': 'Medium — full color, semibold',
  'body': 'Normal — text-primary color',
  'label': 'Low — text-secondary color',
  'small': 'Minimal — text-secondary color',
};

const USE_FOR_MAP: Record<string, string> = {
  'heading-1': 'Page titles, hero headlines',
  'heading-2': 'Section headers, modal titles',
  'heading-3': 'Card titles, subsection headers, list item names',
  'body': 'Descriptive text, paragraphs, form helper text',
  'label': 'Input labels, metadata, captions, timestamps',
  'small': 'Fine print, disclaimers, tertiary info',
};

function buildTypographyScaleTable(tokens: DesignTokensSpec): string {
  const rows = tokens.typography.scale.map((entry, i) => {
    const useFor = USE_FOR_MAP[entry.role] ?? '';
    const visualWeight = VISUAL_WEIGHT_MAP[entry.role] ?? '';
    return `| ${i + 1} | ${entry.role} (${entry.size}px, ${entry.weight}) | ${useFor} | ${visualWeight} |`;
  });

  return `| Level | Token Role | Use For | Visual Weight |
|-------|-----------|---------|---------------|
${rows.join('\n')}`;
}

function buildBorderRadiusTable(tokens: DesignTokensSpec): string {
  const radius = tokens.borders.radius;
  const rows = [
    `| Cards, modals, hero sections | ${radius.large ?? 16}px | \`card.borderRadius = ${radius.large ?? 16}\` |`,
    `| Buttons, inputs, badges | ${radius.medium ?? 12}px | \`btn.borderRadius = ${radius.medium ?? 12}\` |`,
    `| Small chips, tags | ${radius.small ?? 8}px | \`chip.borderRadius = ${radius.small ?? 8}\` |`,
    `| Pills (full-round) | ${radius.pill ?? 9999}px | \`pill.borderRadius = height / 2\` |`,
    `| Avatars | full circle | \`avatar.borderRadius = size / 2\` |`,
  ];

  return `Modern interfaces use rounding from the project's border tokens:

| Element | Radius | Penpot Code |
|---------|--------|-------------|
${rows.join('\n')}`;
}

function buildSpacingTable(tokens: DesignTokensSpec): string {
  const scale = tokens.spacing.scale;
  const unit = tokens.spacing.unit;
  const labels = ['xs', 'sm', 'md', 'base', 'lg', 'xl', '2xl', '3xl'];
  const rows = scale.map((val, i) => {
    const label = labels[i] ?? `${i}`;
    return `| ${label} | ${val}px |`;
  });

  return `Base unit: ${unit}px. Use these values for padding, margins, and gaps:

| Name | Value |
|------|-------|
${rows.join('\n')}`;
}

function buildMotionTable(tokens: DesignTokensSpec): string {
  const motion = tokens.motion;
  if (!motion) {
    return 'No motion tokens configured — use defaults: fast=100ms, normal=200ms, slow=400ms, easing=ease-out.';
  }

  const durationRows = Object.entries(motion.durations)
    .map(([name, ms]) => `| ${name} | ${ms}ms |`)
    .join('\n');

  const easingRows = Object.entries(motion.easings)
    .map(([name, value]) => `| ${name} | \`${value}\` |`)
    .join('\n');

  return `Duration tokens:

| Name | Value |
|------|-------|
${durationRows}

Easing tokens:

| Name | Value |
|------|-------|
${easingRows}`;
}

function buildOpacityTable(tokens: DesignTokensSpec): string {
  const opacity = tokens.opacity;
  if (!opacity) {
    return 'No opacity tokens configured — use defaults: subtle=0.1, muted=0.3, disabled=0.38, overlay=0.5.';
  }

  const rows = Object.entries(opacity.scale)
    .map(([name, value]) => `| ${name} | ${value} |`)
    .join('\n');

  return `| Name | Value |
|------|-------|
${rows}`;
}

/**
 * Replace template placeholders in a prompt string with rendered token tables.
 * Follows the same pattern as `buildTokenAllowlist()` in ux-planning.ts.
 */
export function buildPromptFromTokens(template: string, tokens: DesignTokensSpec): string {
  return template
    .replace('{{TYPOGRAPHY_SCALE_TABLE}}', buildTypographyScaleTable(tokens))
    .replace('{{BORDER_RADIUS_TABLE}}', buildBorderRadiusTable(tokens))
    .replace('{{SPACING_TABLE}}', buildSpacingTable(tokens))
    .replace('{{MOTION_TABLE}}', buildMotionTable(tokens))
    .replace('{{OPACITY_TABLE}}', buildOpacityTable(tokens));
}
