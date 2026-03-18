import { renderTemplate, renderAllTemplates, TEMPLATE_MAP } from './template-renderer.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

describe('renderTemplate', () => {
  it('replaces single placeholder', () => {
    expect(renderTemplate('Hello {{NAME}}', { NAME: 'World' })).toBe('Hello World');
  });

  it('replaces multiple occurrences of same placeholder', () => {
    const content = '{{APP}} is called {{APP}}';
    expect(renderTemplate(content, { APP: 'Foo' })).toBe('Foo is called Foo');
  });

  it('replaces multiple different placeholders', () => {
    const content = '{{A}} and {{B}}';
    expect(renderTemplate(content, { A: 'alpha', B: 'beta' })).toBe('alpha and beta');
  });

  it('leaves unmatched placeholders as-is', () => {
    expect(renderTemplate('{{MISSING}}', {})).toBe('{{MISSING}}');
  });

  it('handles empty content', () => {
    expect(renderTemplate('', { A: 'val' })).toBe('');
  });
});

describe('renderAllTemplates', () => {
  it('renders all templates from the scaffold directory', () => {
    const templatesDir = path.resolve(__dirname, '../../stacks/react-node-prisma/templates/scaffold');
    if (!fs.existsSync(templatesDir)) {
      // Skip if templates dir doesn't exist in test environment
      return;
    }

    const rendered = renderAllTemplates({ PROJECT_NAME: 'my-app' }, templatesDir);

    expect(rendered.size).toBeGreaterThan(0);

    // Check that PROJECT_NAME was replaced
    const packageJson = rendered.get('package.json');
    expect(packageJson).toBeDefined();
    expect(packageJson).toContain('"my-app"');
    expect(packageJson).not.toContain('{{PROJECT_NAME}}');
  });

  it('maps template files to correct output paths', () => {
    expect(TEMPLATE_MAP['package.json.tmpl']).toBe('package.json');
    expect(TEMPLATE_MAP['agentforge-ci.yml.tmpl']).toBe('.github/workflows/agentforge-ci.yml');
    expect(TEMPLATE_MAP['prisma-schema.prisma.tmpl']).toBe('prisma/schema.prisma');
  });
});
