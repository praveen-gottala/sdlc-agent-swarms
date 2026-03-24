/**
 * @jest-environment node
 */
import { GET } from './route';

jest.mock('../_lib/project-reader', () => ({
  readYamlFile: jest.fn(),
}));

import { readYamlFile } from '../_lib/project-reader';
const mockReadYaml = readYamlFile as jest.MockedFunction<typeof readYamlFile>;

describe('GET /api/channels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns all channel types including discord, email, teams', async () => {
    mockReadYaml.mockReturnValue({
      channels: [
        { type: 'slack', name: '#dev', capabilities: 'full', priority: 1, connected: true, routing: ['approvals'] },
        { type: 'telegram', name: 'Alerts', capabilities: 'approvals', priority: 2, connected: true },
        { type: 'cli', name: 'Terminal', capabilities: 'full', priority: 3, connected: true },
        { type: 'discord', name: '#agents', capabilities: 'basic', priority: 4, connected: true },
        { type: 'whatsapp', name: 'Lead', capabilities: 'notify-only', priority: 5, connected: false },
        { type: 'email', name: 'Eng Team', capabilities: 'basic', priority: 6, connected: true },
        { type: 'teams', name: 'Dev Channel', capabilities: 'approvals', priority: 7, connected: true },
      ],
      escalation: {
        approval_timeout_minutes: 60,
        on_timeout: 'pause_and_notify_secondary',
        secondary_timeout_minutes: 120,
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(data.channels).toHaveLength(7);
    expect(data.total).toBe(7);

    const types = data.channels.map((ch: Record<string, unknown>) => ch.type);
    expect(types).toContain('slack');
    expect(types).toContain('telegram');
    expect(types).toContain('cli');
    expect(types).toContain('discord');
    expect(types).toContain('whatsapp');
    expect(types).toContain('email');
    expect(types).toContain('teams');

    // Verify escalation config
    expect(data.escalation.approvalTimeout).toBe(60);
    expect(data.escalation.onTimeout).toBe('pause_and_notify_secondary');
    expect(data.escalation.secondaryTimeout).toBe(120);
  });

  it('returns empty channels when no config exists', async () => {
    mockReadYaml.mockReturnValue(null);

    const response = await GET();
    const data = await response.json();

    expect(data.channels).toHaveLength(0);
    expect(data.total).toBe(0);
  });

  it('maps channel fields correctly', async () => {
    mockReadYaml.mockReturnValue({
      channels: [
        {
          type: 'email',
          name: 'Engineering Team',
          capabilities: 'basic',
          priority: 6,
          connected: true,
          routing: ['status_updates', 'critical_alerts'],
          last_ping: '2026-03-22T08:00:00Z',
          message_count: 45,
        },
      ],
    });

    const response = await GET();
    const data = await response.json();
    const email = data.channels[0];

    expect(email.type).toBe('email');
    expect(email.name).toBe('Engineering Team');
    expect(email.capabilities).toBe('basic');
    expect(email.priority).toBe(6);
    expect(email.status).toBe('connected');
    expect(email.routing).toEqual(['status_updates', 'critical_alerts']);
    expect(email.lastPing).toBe('2026-03-22T08:00:00Z');
    expect(email.messageCount).toBe(45);
  });
});
