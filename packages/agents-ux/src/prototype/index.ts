export { buildPrototypeManifest, extractScreenSummary, extractNavigationFromSpecs } from './build-manifest.js';
export type { ScreenSummary, InteractiveNode } from './build-manifest.js';
export { analyzeNavigation } from './analyze-navigation.js';
export type { SharedChrome, SharedChromeRegion, SharedLayoutPosition } from './resolve-shared-components.js';
export { resolveSharedComponents, componentNameToKebab } from './resolve-shared-components.js';
export {
  applyFrozenChromeToPageSpec,
  buildSharedChromeFilePayload,
  buildSharedChromeRegions,
  deriveRegionsFromPageSpec,
  findNodeIdByCatalog,
  findSharedChromeRootNodeId,
  propagateNavigateToChromeTabs,
} from './merge-frozen-chrome.js';
export { designChromeComponents, SHARED_CHROME_MODULE_ID } from './design-chrome.js';
export type { DesignChromeInput } from './design-chrome.js';
