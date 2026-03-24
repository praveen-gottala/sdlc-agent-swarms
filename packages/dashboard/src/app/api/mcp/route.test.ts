/**
 * @jest-environment node
 */
import { GET } from './route';

jest.mock('../_lib/project-reader', () => ({
  readYamlFile: jest.fn(),
}));

import { readYamlFile } from '../_lib/project-reader';
const mockReadYaml = readYamlFile as jest.MockedFunction<typeof readYamlFile>;

describe('GET /api/mcp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns all MCP servers with tools and health metrics', async () => {
    mockReadYaml.mockReturnValue({
      mcp: [
        {
          name: 'Talk to Figma',
          uri: 'http://localhost:3055/sse',
          transport: 'sse',
          connected: true,
          auth: 'api_key',
          rate_limit_rpm: 60,
          tools: ['figma.generate_figma_design', 'figma.get_screenshot'],
          calls_24h: 145,
          errors_24h: 2,
        },
        {
          name: 'GitHub',
          uri: 'stdio://github-mcp-server',
          transport: 'stdio',
          connected: true,
          auth: 'token',
          rate_limit_rpm: 120,
          tools: ['github.create_pull_request', 'github.list_issues'],
          calls_24h: 312,
          errors_24h: 0,
        },
        {
          name: 'Filesystem',
          uri: 'stdio://fs-mcp-server',
          transport: 'stdio',
          connected: true,
          auth: 'none',
          rate_limit_rpm: 500,
          tools: ['fs.read_file', 'fs.write_file'],
          calls_24h: 1847,
          errors_24h: 1,
        },
        {
          name: 'PostgreSQL',
          uri: 'http://localhost:3060/sse',
          transport: 'sse',
          connected: false,
          auth: 'connection_string',
          rate_limit_rpm: 100,
          tools: ['postgres.query', 'postgres.list_tables'],
          calls_24h: 0,
          errors_24h: 0,
        },
        {
          name: 'Slack Notify',
          uri: 'stdio://slack-mcp-server',
          transport: 'stdio',
          connected: true,
          auth: 'bot_token',
          rate_limit_rpm: 30,
          tools: ['slack.send_message', 'slack.send_approval'],
          calls_24h: 89,
          errors_24h: 0,
        },
        {
          name: 'Docker',
          uri: 'stdio://docker-mcp-server',
          transport: 'stdio',
          connected: true,
          auth: 'none',
          rate_limit_rpm: 120,
          tools: ['docker.list_containers', 'docker.run_container'],
          calls_24h: 78,
          errors_24h: 1,
        },
      ],
    });

    const response = await GET();
    const data = await response.json();

    expect(data.servers).toHaveLength(6);
    expect(data.total).toBe(6);

    const names = data.servers.map((s: Record<string, unknown>) => s.name);
    expect(names).toContain('Talk to Figma');
    expect(names).toContain('GitHub');
    expect(names).toContain('Filesystem');
    expect(names).toContain('PostgreSQL');
    expect(names).toContain('Slack Notify');
    expect(names).toContain('Docker');

    // Verify disconnected server
    const postgres = data.servers.find((s: Record<string, unknown>) => s.name === 'PostgreSQL');
    expect(postgres.status).toBe('disconnected');
    expect(postgres.lastHeartbeat).toBeNull();

    // Verify connected server with errors
    const docker = data.servers.find((s: Record<string, unknown>) => s.name === 'Docker');
    expect(docker.status).toBe('connected');
    expect(docker.errors24h).toBe(1);
  });

  it('returns empty servers when no config exists', async () => {
    mockReadYaml.mockReturnValue(null);

    const response = await GET();
    const data = await response.json();

    expect(data.servers).toHaveLength(0);
    expect(data.total).toBe(0);
  });
});
