/**
 * @jest-environment node
 */
import { GET } from './route';

jest.mock('../_lib/project-reader', () => ({
  readYamlFile: jest.fn(),
}));

import { readYamlFile } from '../_lib/project-reader';
const mockReadYaml = readYamlFile as jest.MockedFunction<typeof readYamlFile>;

describe('GET /api/design', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns Figma and Storybook design tools', async () => {
    mockReadYaml.mockReturnValue({
      design: {
        figma: {
          connected: true,
          file_id: 'abc123',
          file_url: 'https://www.figma.com/design/abc123/Test',
          design_system_type: 'tailwind',
          bidirectional: true,
          capabilities: ['read_wireframes', 'write_designs', 'extract_tokens'],
          last_sync: '2026-03-22T07:30:00Z',
        },
        storybook: {
          connected: true,
          url: 'http://localhost:6006',
          hot_reload: true,
          visual_testing: true,
          capabilities: ['component_preview', 'visual_regression', 'accessibility_audit'],
          last_sync: '2026-03-22T06:45:00Z',
        },
        design_system: {
          name: 'Test DS',
          version: '1.0.0',
          tokens_count: 32,
          components_count: 16,
        },
      },
    });

    const response = await GET();
    const data = await response.json();

    // Figma
    expect(data.design.figma).toBeDefined();
    expect(data.design.figma.connected).toBe(true);
    expect(data.design.figma.fileId).toBe('abc123');
    expect(data.design.figma.bidirectional).toBe(true);
    expect(data.design.figma.capabilities).toContain('read_wireframes');

    // Storybook
    expect(data.design.storybook).toBeDefined();
    expect(data.design.storybook.connected).toBe(true);
    expect(data.design.storybook.url).toBe('http://localhost:6006');
    expect(data.design.storybook.hotReload).toBe(true);

    // Design system
    expect(data.design.designSystem).toBeDefined();
    expect(data.design.designSystem.name).toBe('Test DS');
    expect(data.design.designSystem.componentsCount).toBe(16);
  });

  it('returns null for unconfigured design tools', async () => {
    mockReadYaml.mockReturnValue({
      design: {
        figma: { connected: true, capabilities: [] },
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(data.design.figma).toBeDefined();
    expect(data.design.storybook).toBeNull();
    expect(data.design.designSystem).toBeNull();
  });

  it('returns empty design when no config exists', async () => {
    mockReadYaml.mockReturnValue(null);

    const response = await GET();
    const data = await response.json();

    expect(data.design.figma).toBeNull();
    expect(data.design.storybook).toBeNull();
  });
});
