import type { DesignSpecV2, NodeSpec } from '@agentforge/designspec-renderer';
import { promoteToCatalog } from './promote-to-catalog.js';

function makeSpec(nodes: Record<string, NodeSpec>): DesignSpecV2 {
  return { screen: 'test', width: 1440, nodes };
}

describe('promoteToCatalog', () => {
  describe('Section promotion', () => {
    it('promotes container with heading-text first child to Section', () => {
      const spec = makeSpec({
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        sec: { parent: 'root', order: 0, type: 'container', layout: { dir: 'column', gap: 16 }, background: 'surface-primary', shadow: 'sm' },
        title: { parent: 'sec', order: 0, type: 'text', content: 'Profile', typography: 'heading-2', color: 'text-primary' },
        input1: { parent: 'sec', order: 1, catalog: 'input-text', label: 'Name', placeholder: 'Name' },
        input2: { parent: 'sec', order: 2, catalog: 'input-text', label: 'Email', placeholder: 'Email' },
      });

      const { spec: result, promotions } = promoteToCatalog(spec);

      expect(result.nodes['sec'].catalog).toBe('Section');
      expect(result.nodes['sec'].label).toBe('Profile');
      expect(result.nodes['sec'].type).toBeUndefined();
      expect(result.nodes['sec'].background).toBe('surface-primary');
      expect(result.nodes['sec'].shadow).toBe('sm');
      expect(result.nodes['title']).toBeUndefined();
      expect(result.nodes['input1'].order).toBe(0);
      expect(result.nodes['input2'].order).toBe(1);
      expect(promotions).toHaveLength(1);
      expect(promotions[0]).toEqual({ nodeId: 'sec', from: 'container', to: 'Section' });
    });

    it('does not promote container without heading-text first child', () => {
      const spec = makeSpec({
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        sec: { parent: 'root', order: 0, type: 'container', layout: { dir: 'column' } },
        card1: { parent: 'sec', order: 0, catalog: 'card', label: 'Item 1' },
        card2: { parent: 'sec', order: 1, catalog: 'card', label: 'Item 2' },
      });

      const { spec: result, promotions } = promoteToCatalog(spec);

      expect(result.nodes['sec'].type).toBe('container');
      expect(promotions).toHaveLength(0);
    });

    it('does not promote container with only one child', () => {
      const spec = makeSpec({
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        sec: { parent: 'root', order: 0, type: 'container', layout: { dir: 'column' } },
        title: { parent: 'sec', order: 0, type: 'text', content: 'Title', typography: 'heading-2' },
      });

      const { promotions } = promoteToCatalog(spec);
      expect(promotions).toHaveLength(0);
    });

    it('does not promote container with non-heading text', () => {
      const spec = makeSpec({
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        sec: { parent: 'root', order: 0, type: 'container', layout: { dir: 'column' } },
        desc: { parent: 'sec', order: 0, type: 'text', content: 'Some body text', typography: 'body' },
        card: { parent: 'sec', order: 1, catalog: 'card', label: 'Item' },
      });

      const { promotions } = promoteToCatalog(spec);
      expect(promotions).toHaveLength(0);
    });
  });

  describe('Form promotion', () => {
    it('promotes container with 50%+ input children to Form', () => {
      const spec = makeSpec({
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        form: { parent: 'root', order: 0, type: 'container', layout: { dir: 'column', gap: 16 } },
        input1: { parent: 'form', order: 0, catalog: 'input-text', label: 'Name', placeholder: 'Name' },
        input2: { parent: 'form', order: 1, catalog: 'select', label: 'Country', placeholder: 'Select' },
        btn: { parent: 'form', order: 2, catalog: 'button-primary', label: 'Submit' },
      });

      const { spec: result, promotions } = promoteToCatalog(spec);

      expect(result.nodes['form'].catalog).toBe('Form');
      expect(result.nodes['form'].type).toBeUndefined();
      expect(promotions).toHaveLength(1);
      expect(promotions[0].to).toBe('Form');
    });

    it('does not promote container with less than 50% inputs', () => {
      const spec = makeSpec({
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        wrapper: { parent: 'root', order: 0, type: 'container', layout: { dir: 'column' } },
        text1: { parent: 'wrapper', order: 0, type: 'text', content: 'Hello', typography: 'body' },
        text2: { parent: 'wrapper', order: 1, type: 'text', content: 'World', typography: 'body' },
        input1: { parent: 'wrapper', order: 2, catalog: 'input-text', label: 'Name', placeholder: 'Name' },
      });

      const { promotions } = promoteToCatalog(spec);
      expect(promotions).toHaveLength(0);
    });
  });

  describe('PageHeader promotion', () => {
    it('promotes header child of root to PageHeader', () => {
      const spec = makeSpec({
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        hdr: { parent: 'root', order: 0, type: 'header', layout: { dir: 'row', align: 'center' }, background: 'surface-primary' },
        title: { parent: 'hdr', order: 0, type: 'text', content: 'Dashboard', typography: 'heading-1' },
        nav: { parent: 'hdr', order: 1, type: 'text', content: 'Home', typography: 'body' },
      });

      const { spec: result, promotions } = promoteToCatalog(spec);

      expect(result.nodes['hdr'].catalog).toBe('PageHeader');
      expect(result.nodes['hdr'].label).toBe('Dashboard');
      expect(result.nodes['hdr'].type).toBeUndefined();
      expect(result.nodes['hdr'].background).toBe('surface-primary');
      expect(promotions).toHaveLength(1);
    });

    it('does not promote header that is not child of root', () => {
      const spec = makeSpec({
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        wrapper: { parent: 'root', order: 0, type: 'container', layout: { dir: 'column' } },
        hdr: { parent: 'wrapper', order: 0, type: 'header', layout: { dir: 'row' } },
      });

      const { promotions } = promoteToCatalog(spec);
      expect(promotions).toHaveLength(0);
    });
  });

  describe('idempotency', () => {
    it('running twice produces identical output', () => {
      const spec = makeSpec({
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        sec: { parent: 'root', order: 0, type: 'container', layout: { dir: 'column' } },
        title: { parent: 'sec', order: 0, type: 'text', content: 'Title', typography: 'heading-2' },
        child: { parent: 'sec', order: 1, type: 'container', layout: { dir: 'column' } },
      });

      const first = promoteToCatalog(spec);
      const second = promoteToCatalog(first.spec);

      expect(second.spec).toEqual(first.spec);
      expect(second.promotions).toHaveLength(0);
    });
  });

  describe('multiple promotions', () => {
    it('promotes multiple patterns in one pass', () => {
      const spec = makeSpec({
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        hdr: { parent: 'root', order: 0, type: 'header', layout: { dir: 'row' } },
        htitle: { parent: 'hdr', order: 0, type: 'text', content: 'App', typography: 'heading-1' },
        sec: { parent: 'root', order: 1, type: 'container', layout: { dir: 'column' } },
        stitle: { parent: 'sec', order: 0, type: 'text', content: 'Settings', typography: 'heading-2' },
        input1: { parent: 'sec', order: 1, catalog: 'input-text', label: 'Name', placeholder: '' },
        form: { parent: 'root', order: 2, type: 'container', layout: { dir: 'column' } },
        f1: { parent: 'form', order: 0, catalog: 'input-text', label: 'A', placeholder: '' },
        f2: { parent: 'form', order: 1, catalog: 'select', label: 'B', placeholder: '' },
      });

      const { promotions } = promoteToCatalog(spec);

      const types = promotions.map(p => p.to).sort();
      expect(types).toEqual(['Form', 'PageHeader', 'Section']);
    });
  });

  describe('preserves original spec', () => {
    it('does not mutate the input spec', () => {
      const spec = makeSpec({
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        sec: { parent: 'root', order: 0, type: 'container', layout: { dir: 'column' } },
        title: { parent: 'sec', order: 0, type: 'text', content: 'Title', typography: 'heading-2' },
        child: { parent: 'sec', order: 1, type: 'container', layout: { dir: 'column' } },
      });

      const original = JSON.parse(JSON.stringify(spec));
      promoteToCatalog(spec);

      expect(spec).toEqual(original);
    });
  });
});
