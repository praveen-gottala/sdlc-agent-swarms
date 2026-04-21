import { NextResponse } from 'next/server';
import { Writable } from 'node:stream';
import { designPageAllCommand } from '@agentforge/cli';
import { getActiveProjectRoot } from '../../_lib/project-reader';

/**
 * Long-running: Research → Planning → Design for all pages (same as
 * `agentforge design:page:all`). Used by `@b2.5-full-loop` E2E instead of shelling out.
 */
export const maxDuration = 800;

export async function POST() {
  let projectRoot: string;
  try {
    projectRoot = getActiveProjectRoot();
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }

  const sink = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });

  const prevExit = process.exitCode;
  process.exitCode = undefined;
  try {
    await designPageAllCommand(sink, { projectRoot });
    const code = process.exitCode ?? 0;
    process.exitCode = prevExit;
    if (code !== 0) {
      return NextResponse.json(
        { ok: false, error: 'design:page:all exited with non-zero status' },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, projectRoot });
  } catch (err) {
    process.exitCode = prevExit;
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
