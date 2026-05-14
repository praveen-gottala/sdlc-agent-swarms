import { createApp } from '@backstage/frontend-defaults';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import {
  techDocsExpandableNavigationAddonModule,
  techDocsLightBoxAddonModule,
  techDocsReportIssueAddonModule,
  techDocsTextSizeAddonModule,
} from '@backstage/plugin-techdocs-module-addons-contrib/alpha';
import techdocsMermaidModule from 'backstage-plugin-techdocs-addon-mermaid/alpha';
import { navModule } from './modules/nav';

export default createApp({
  features: [
    catalogPlugin,
    techdocsMermaidModule,
    techDocsExpandableNavigationAddonModule,
    techDocsLightBoxAddonModule,
    techDocsReportIssueAddonModule,
    techDocsTextSizeAddonModule,
    navModule,
  ],
});
