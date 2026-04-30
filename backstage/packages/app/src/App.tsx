import { createApp } from '@backstage/frontend-defaults';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import techdocsMermaidModule from 'backstage-plugin-techdocs-addon-mermaid/alpha';
import { navModule } from './modules/nav';

export default createApp({
  features: [catalogPlugin, techdocsMermaidModule, navModule],
});
