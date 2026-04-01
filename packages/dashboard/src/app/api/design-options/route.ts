import { NextRequest, NextResponse } from 'next/server';
import {
  buildFallbackOptions,
  generatePreviewHtml,
  type DesignOption,
} from '@agentforge/cli';

interface DesignOptionsRequest {
  appName: string;
  description?: string;
  targetAudience?: string;
  prdContent?: string;
  useFallback?: boolean;
}

/** POST /api/design-options — generate 3 design options with HTML preview */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DesignOptionsRequest;
    const { appName, description, targetAudience, prdContent, useFallback } = body;

    if (!appName || typeof appName !== 'string') {
      return NextResponse.json({ error: 'appName is required' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    let options: DesignOption[];
    let source: 'llm' | 'fallback' = 'fallback';

    if (!apiKey || useFallback) {
      options = buildFallbackOptions();
    } else {
      try {
        options = await generateOptionsViaLLM(apiKey, {
          appName,
          description: description ?? '',
          targetAudience: targetAudience ?? '',
          prdContent,
        });
        source = 'llm';
      } catch (err) {
        console.error('LLM design options generation failed, using fallback:', err);
        options = buildFallbackOptions();
      }
    }

    // Generate preview HTML and inject iframe communication script
    let previewHtml = generatePreviewHtml(appName, options);
    previewHtml = injectIframeCommunication(previewHtml);

    return NextResponse.json({ previewHtml, options, source });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** Call Anthropic API to generate design options using structured output. */
async function generateOptionsViaLLM(
  apiKey: string,
  context: { appName: string; description: string; targetAudience: string; prdContent?: string },
): Promise<DesignOption[]> {
  const appContext = context.prdContent
    ? `- App name: ${context.appName}\n\nPRD:\n${context.prdContent}`
    : `- App name: ${context.appName}\n- Description: ${context.description || 'A web application'}\n- Target audience: ${context.targetAudience || 'general'}`;

  const systemPrompt = `You are a design system expert. Generate 3 distinct design direction options for a web application.

Each option should feel meaningfully different — vary the mood, color temperature, and typography personality.

Rules:
- 5-8 primitive colors per option, using kebab-case names (e.g. "deep-teal", "warm-cream")
- Semantic color values should reference primitive color names (except overlay which is an rgba value)
- Use real Google Fonts that pair well
- Ensure sufficient contrast between background-primary and text-primary (WCAG AA)
- Elevation shadows should feel cohesive with the design direction (4 levels: flat, cards, dropdowns, modals)

Return a JSON object with an "options" array of 3 objects, each with:
- label: string (e.g. "Warm & Inviting")
- vibe: string (short description)
- colors: { primitive: Record<string, string>, semantic: Record<string, string> with keys: background-primary, surface-primary, surface-elevated, surface-secondary, surface-input, text-primary, text-secondary, text-disabled, text-on-cta, cta-primary, cta-hover, border-default, border-focus, border-error, error, success, warning, info, overlay }
- fonts: { display: string, body: string }
- brand: { tone: string, illustrationDirection: string, illustrationDescription: string, motionFeel: "snappy"|"smooth"|"bouncy"|"subtle" }
- elevation: { levels: [{ level: number, shadow: string, description: string }] }`;

  const MAX_RETRIES = 3;
  const RETRYABLE_STATUSES = [429, 529];

  let lastError: Error | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Generate 3 design system options for:\n${appContext}`,
          },
        ],
      }),
    });

    if (response.ok) {
      result = await response.json();
      lastError = null;
      break;
    }

    const text = await response.text();
    lastError = new Error(`Anthropic API error ${response.status}: ${text}`);

    if (!RETRYABLE_STATUSES.includes(response.status)) {
      throw lastError;
    }
  }

  if (lastError) {
    throw lastError;
  }
  const textBlock = result.content?.find((b: { type: string }) => b.type === 'text');
  if (!textBlock) {
    throw new Error('No text content in LLM response');
  }

  const cleaned = textBlock.text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  const parsed = JSON.parse(cleaned) as { options: DesignOption[] };

  if (!parsed.options || !Array.isArray(parsed.options) || parsed.options.length < 3) {
    throw new Error('LLM returned fewer than 3 design options');
  }

  // Normalize primitive arrays to records if needed
  return parsed.options.map((opt) => {
    const colors = opt.colors as unknown as { primitive: Array<{ name: string; hex: string }> | Record<string, string>; semantic: Record<string, string> };
    const primitive: Record<string, string> = Array.isArray(colors.primitive)
      ? Object.fromEntries(colors.primitive.map((c: { name: string; hex: string }) => [c.name, c.hex]))
      : colors.primitive;
    return { ...opt, colors: { primitive, semantic: colors.semantic } } as unknown as DesignOption;
  });
}

/** Inject floating select button and postMessage communication into preview HTML. */
function injectIframeCommunication(html: string): string {
  const script = `
<style>
  .af-select-btn {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 10000;
    background: #3B82F6;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(59,130,246,0.4);
    transition: all 0.2s;
  }
  .af-select-btn:hover {
    background: #2563EB;
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(59,130,246,0.5);
  }
</style>
<button class="af-select-btn" onclick="selectCurrentOption()">Select This Option</button>
<script>
  var currentOptionIndex = 0;

  // Override the existing switchTab to track current option
  var originalSwitchTab = window.switchTab;
  window.switchTab = function(tab) {
    currentOptionIndex = tab - 1;
    if (originalSwitchTab) originalSwitchTab(tab);
    window.parent.postMessage({
      type: 'design-option-viewed',
      optionIndex: currentOptionIndex,
      source: 'agentforge-design-preview'
    }, '*');
  };

  function selectCurrentOption() {
    window.parent.postMessage({
      type: 'design-option-selected',
      optionIndex: currentOptionIndex,
      source: 'agentforge-design-preview'
    }, '*');
  }
<\/script>`;

  return html.replace('</body>', `${script}\n</body>`);
}
