import { NextRequest, NextResponse } from 'next/server';
import { readDesignSpecText } from '@agentforge/core';
import { readYamlFile, getActiveProjectRoot } from '../../_lib/project-reader';
import {
  verifyNode,
  buildSimpleTokenMap,
  checkMechanicalIssues,
} from '@agentforge/designspec-renderer';
import type {
  DesignSpecV2,
  RendererTokens,
  DOMLayoutData,
  NodeSpec,
} from '@agentforge/designspec-renderer';

export const dynamic = 'force-dynamic';

/**
 * POST /api/design/audit
 *
 * Runs mechanical property-by-property verification comparing the design spec
 * against extracted DOM data. The client extracts DOM via the iframe bridge
 * and sends it here; the server runs the pure verification functions.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { pageId?: string; domData?: DOMLayoutData };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { pageId, domData } = body;
  if (!pageId || !domData) {
    return NextResponse.json({ error: 'Missing pageId or domData' }, { status: 400 });
  }

  const specText = readDesignSpecText(getActiveProjectRoot(), pageId);
  if (!specText) {
    return NextResponse.json({ error: `Design spec not found for page: ${pageId}` }, { status: 404 });
  }

  let spec: DesignSpecV2;
  try {
    spec = JSON.parse(specText) as DesignSpecV2;
  } catch {
    return NextResponse.json({ error: 'Invalid design spec JSON' }, { status: 500 });
  }

  const rawTokens = readYamlFile<Record<string, unknown>>('agentforge/spec/design-tokens.yaml');
  const tokens: RendererTokens = rawTokens
    ? (() => { const { version: _, created_by: __, ...rest } = rawTokens; void _; void __; return rest as RendererTokens; })()
    : {} as RendererTokens;

  const tokenMap = buildSimpleTokenMap(tokens);
  const specNodes = spec.nodes as Record<string, NodeSpec>;

  const reports = Object.entries(specNodes).map(([nodeId, nodeSpec]) => {
    const domNode = domData.nodes[nodeId];
    const domInfo = domNode
      ? { computed: domNode.computed, attributes: domNode.attributes, textContent: domNode.textContent }
      : undefined;
    return verifyNode(nodeId, nodeSpec, domNode?.computed, tokenMap, domInfo);
  });

  const mechIssues = checkMechanicalIssues(domData, spec);

  let pass = 0, fail = 0, drop = 0, skip = 0, dataPass = 0, dataFail = 0, dataSkip = 0;
  for (const r of reports) {
    for (const c of r.checks) {
      switch (c.verdict) {
        case 'PASS': pass++; break;
        case 'FAIL': fail++; break;
        case 'DROP': drop++; break;
        case 'SKIP': skip++; break;
        case 'DATA-PASS': dataPass++; break;
        case 'DATA-FAIL': dataFail++; break;
        case 'DATA-SKIP': dataSkip++; break;
      }
    }
  }

  return NextResponse.json({
    reports,
    mechIssues: mechIssues.map(i => ({
      nodeId: i.nodeId,
      rule: i.rule,
      autoFixable: i.autoFixable,
      description: i.description,
    })),
    summary: {
      totalChecks: pass + fail + drop + skip + dataPass + dataFail + dataSkip,
      pass, fail, drop, skip, dataPass, dataFail, dataSkip,
      specNodeCount: Object.keys(specNodes).length,
      domNodeCount: Object.keys(domData.nodes).length,
    },
  });
}
