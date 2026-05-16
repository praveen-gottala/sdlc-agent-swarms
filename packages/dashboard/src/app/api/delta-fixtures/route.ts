/**
 * GET /api/delta-fixtures?name=cashpulse-add-recurring
 * Loads a delta fixture YAML from packages/eval/src/fixtures/deltas/.
 * Returns the fixture data (delta + metadata + highlightNodes) as JSON.
 */
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'yaml';

function getFixturesDir(): string {
  return path.resolve(process.cwd(), '..', 'eval', 'src', 'fixtures', 'deltas');
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const name = request.nextUrl.searchParams.get('name');
  const fixturesDir = getFixturesDir();

  if (!name) {
    const available = fs.existsSync(fixturesDir)
      ? fs.readdirSync(fixturesDir).filter(f => f.endsWith('.yaml')).map(f => f.replace('.yaml', ''))
      : [];
    return NextResponse.json({ error: 'Missing "name" query parameter', available }, { status: 400 });
  }

  const filePath = path.join(fixturesDir, `${name}.yaml`);
  if (!fs.existsSync(filePath)) {
    const available = fs.existsSync(fixturesDir)
      ? fs.readdirSync(fixturesDir).filter(f => f.endsWith('.yaml')).map(f => f.replace('.yaml', ''))
      : [];
    return NextResponse.json({ error: `Fixture "${name}" not found`, available }, { status: 404 });
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const fixture = parse(raw);
  return NextResponse.json(fixture);
}
