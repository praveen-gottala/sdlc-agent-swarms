/**
 * @module @agentforge/designspec-renderer/renderer/react/components
 * Registry of React component renderers — accelerators and catalog.
 */
import type { ReactComponentRenderer } from './types.js';
import { renderPage } from './page.js';
import { renderHeader } from './header.js';
import { renderContainer } from './container.js';
import { renderSection } from './section.js';
import { renderText } from './text.js';
import { renderDivider } from './divider.js';
import { renderSpacer } from './spacer.js';
import { renderButtonPrimary } from './button-primary.js';
import { renderButtonSecondary } from './button-secondary.js';
import { renderButtonGhost } from './button-ghost.js';
import { renderButtonDestructive } from './button-destructive.js';
import { renderInputText } from './input-text.js';
import { renderInputCurrency } from './input-currency.js';
import { renderSelect } from './select.js';
import { renderSegmentedControl } from './segmented-control.js';
import { renderStepper } from './stepper.js';
import { renderDisplayReadonly } from './display-readonly.js';
import { renderCheckbox } from './checkbox.js';
import { renderCard } from './card.js';
import { renderBadge } from './badge.js';
import { renderStat } from './stat.js';
import { renderAvatar } from './avatar.js';
import { renderTooltip } from './tooltip.js';
import { renderChip } from './chip.js';
import { renderProgressBar } from './progress-bar.js';
import { renderSearchInput } from './search-input.js';
import { renderPagination } from './pagination.js';

/** Accelerator type → renderer. */
const ACCELERATOR_RENDERERS: Readonly<Record<string, ReactComponentRenderer>> = {
  page: renderPage,
  header: renderHeader,
  container: renderContainer,
  section: renderSection,
  text: renderText,
  divider: renderDivider,
  spacer: renderSpacer,
};

/** Catalog ID → renderer. */
const CATALOG_RENDERERS: Readonly<Record<string, ReactComponentRenderer>> = {
  'button-primary': renderButtonPrimary,
  'button-secondary': renderButtonSecondary,
  'button-ghost': renderButtonGhost,
  'button-destructive': renderButtonDestructive,
  'input-text': renderInputText,
  'input-currency': renderInputCurrency,
  'select': renderSelect,
  'segmented-control': renderSegmentedControl,
  'stepper': renderStepper,
  'display-readonly': renderDisplayReadonly,
  'checkbox': renderCheckbox,
  'card': renderCard,
  'badge': renderBadge,
  'badge-warning': renderBadge,
  'badge-success': renderBadge,
  'badge-error': renderBadge,
  'badge-info': renderBadge,
  'stat': renderStat,
  'avatar': renderAvatar,
  'tooltip': renderTooltip,
  'chip': renderChip,
  'progress-bar-active': renderProgressBar,
  'search-input': renderSearchInput,
  'pagination': renderPagination,
};

/** Get a renderer for an accelerator type. */
export function getAcceleratorRenderer(type: string): ReactComponentRenderer | undefined {
  return ACCELERATOR_RENDERERS[type];
}

/** Get a renderer for a catalog entry ID. */
export function getCatalogRenderer(catalogId: string): ReactComponentRenderer | undefined {
  return CATALOG_RENDERERS[catalogId];
}
