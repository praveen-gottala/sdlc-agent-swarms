import { NextResponse } from 'next/server';
import { readYamlFile } from '../_lib/project-reader';

interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
  notificationsEnabled: boolean;
  autoRefreshInterval: number;
  defaultView: 'pipeline' | 'kanban' | 'list';
  costAlertThreshold: number;
  timezone: string;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  sidebarCollapsed: false,
  notificationsEnabled: true,
  autoRefreshInterval: 30,
  defaultView: 'pipeline',
  costAlertThreshold: 40,
  timezone: 'America/New_York',
};

/**
 * GET /api/preferences
 * Returns user preferences from .agentforge/dashboard-preferences.yaml,
 * falling back to defaults if the file doesn't exist.
 */
export async function GET() {
  const saved = readYamlFile<Partial<UserPreferences>>(
    '.agentforge/dashboard-preferences.yaml',
  );
  const preferences: UserPreferences = { ...DEFAULT_PREFERENCES, ...saved };
  return NextResponse.json({ preferences });
}

/**
 * PUT /api/preferences
 * Updates user preferences. Accepts partial preference object.
 * TODO: Persist to .agentforge/dashboard-preferences.yaml.
 */
export async function PUT(request: Request) {
  let body: Partial<UserPreferences>;

  try {
    body = (await request.json()) as Partial<UserPreferences>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const saved = readYamlFile<Partial<UserPreferences>>(
    '.agentforge/dashboard-preferences.yaml',
  );
  const updated: UserPreferences = { ...DEFAULT_PREFERENCES, ...saved, ...body };

  return NextResponse.json({
    preferences: updated,
    updatedAt: new Date().toISOString(),
  });
}
