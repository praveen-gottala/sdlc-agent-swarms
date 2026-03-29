/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components
 * Registry of accelerator and catalog component renderers.
 */
import type { ComponentRenderer } from './types.js';

// Accelerator renderers
import { renderPage } from './page.js';
import { renderContainer } from './container.js';
import { renderSection } from './section.js';
import { renderHeader } from './header.js';
import { renderDivider } from './divider.js';
import { renderSpacer } from './spacer.js';
import { renderText } from './text.js';

// Catalog (differentiator) renderers
import { renderInputText } from './input-text.js';
import { renderInputCurrency } from './input-currency.js';
import { renderButtonPrimary } from './button-primary.js';
import { renderButtonSecondary } from './button-secondary.js';
import { renderButtonGhost } from './button-ghost.js';
import { renderSegmentedControl } from './segmented-control.js';
import { renderStepper } from './stepper.js';
import { renderDisplayReadonly } from './display-readonly.js';
import { renderBadge } from './badge.js';
import { renderStat } from './stat.js';
import { renderCard } from './card.js';
import { renderAvatar } from './avatar.js';
import { renderTooltip } from './tooltip.js';
import { renderCheckbox } from './checkbox.js';
import { renderSelect } from './select.js';
import { renderChip } from './chip.js';
import { renderAlert } from './alert.js';
import { renderSkeleton } from './skeleton.js';
import { renderLoadingSpinner } from './loading-spinner.js';
import { renderLink } from './link.js';
import { renderSwitch } from './switch.js';
import { renderDataTable } from './data-table.js';

/** Map of accelerator type name to its renderer function. */
const ACCELERATOR_RENDERERS: Record<string, ComponentRenderer> = {
  page: renderPage,
  container: renderContainer,
  section: renderSection,
  header: renderHeader,
  divider: renderDivider,
  spacer: renderSpacer,
  text: renderText,
};

/** Map of catalog entry ID to its renderer function. */
const CATALOG_RENDERERS: Record<string, ComponentRenderer> = {
  'input-text': renderInputText,
  'input-currency': renderInputCurrency,
  'button-primary': renderButtonPrimary,
  'button-secondary': renderButtonSecondary,
  'button-ghost': renderButtonGhost,
  'segmented-control': renderSegmentedControl,
  'stepper': renderStepper,
  'display-readonly': renderDisplayReadonly,
  'badge': renderBadge,
  'stat': renderStat,
  'card': renderCard,
  'avatar': renderAvatar,
  'tooltip': renderTooltip,
  'checkbox': renderCheckbox,
  'select': renderSelect,
  'chip': renderChip,
  'alert': renderAlert,
  'skeleton': renderSkeleton,
  'loading-spinner': renderLoadingSpinner,
  'link': renderLink,
  'switch': renderSwitch,
  'data-table': renderDataTable,
};

/**
 * Look up the renderer for an accelerator type.
 * Returns undefined if the type has no built-in renderer (e.g., catalog components).
 */
export function getAcceleratorRenderer(
  type: string,
): ComponentRenderer | undefined {
  return ACCELERATOR_RENDERERS[type];
}

/**
 * Look up the renderer for a catalog entry ID.
 * Returns undefined if the catalog ID has no built-in renderer.
 */
export function getCatalogRenderer(
  catalogId: string,
): ComponentRenderer | undefined {
  return CATALOG_RENDERERS[catalogId];
}

export type { ComponentRenderer } from './types.js';
export {
  renderPage,
  renderContainer,
  renderSection,
  renderHeader,
  renderDivider,
  renderSpacer,
  renderText,
  renderInputText,
  renderInputCurrency,
  renderButtonPrimary,
  renderButtonSecondary,
  renderButtonGhost,
  renderSegmentedControl,
  renderStepper,
  renderDisplayReadonly,
  renderBadge,
  renderStat,
  renderCard,
  renderAvatar,
  renderTooltip,
  renderCheckbox,
  renderSelect,
  renderChip,
  renderAlert,
  renderSkeleton,
  renderLoadingSpinner,
  renderLink,
  renderSwitch,
  renderDataTable,
};
