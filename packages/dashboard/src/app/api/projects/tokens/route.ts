import { NextResponse } from 'next/server';
import { readYamlFile } from '../../_lib/project-reader';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/tokens
 *
 * Reads agentforge/spec/design-tokens.yaml from the active project,
 * resolves semantic colors through primitives, and returns a flat
 * color map: { [tokenName]: hexValue }.
 */
export async function GET() {
  try {
    const tokens = readYamlFile<any>('agentforge/spec/design-tokens.yaml');
    if (!tokens) {
      return NextResponse.json({ colorMap: {} });
    }

    const primitives: Record<string, string> = tokens.colors?.primitive ?? {};
    const semantics: Record<string, string> = tokens.colors?.semantic ?? {};

    const colorMap: Record<string, string> = {};

    // Add primitives directly
    for (const [name, hex] of Object.entries(primitives)) {
      colorMap[name] = hex;
    }

    // Resolve semantics through primitives
    for (const [name, ref] of Object.entries(semantics)) {
      if (ref.startsWith('#')) {
        colorMap[name] = ref;
      } else if (primitives[ref]) {
        colorMap[name] = primitives[ref];
      } else {
        colorMap[name] = ref;
      }
    }

    return NextResponse.json({ colorMap });
  } catch {
    return NextResponse.json({ colorMap: {} });
  }
}
