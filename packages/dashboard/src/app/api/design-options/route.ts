import { NextRequest, NextResponse } from 'next/server';
import {
  buildFallbackOptions,
  generatePreviewHtml,
  type DesignOption,
} from '@agentforge/cli';
import { getClaudeProvider } from '../_lib/llm-provider';
import { debugLog } from '@agentforge/core';

export const dynamic = 'force-dynamic';

interface DesignOptionsRequest {
  appName: string;
  description?: string;
  targetAudience?: string;
  prdContent?: string;
  useFallback?: boolean;
  colorScheme?: 'light' | 'dark' | 'both';
}

type FallbackReason = 'user_choice' | 'no_api_key' | 'llm_error';

/** POST /api/design-options — generate 3 design options with HTML preview */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as DesignOptionsRequest;
    const { appName, description, targetAudience, prdContent, useFallback, colorScheme } = body;

    if (!appName || typeof appName !== 'string') {
      return NextResponse.json({ error: 'appName is required' }, { status: 400 });
    }

    let options: DesignOption[];
    let source: 'llm' | 'fallback' = 'fallback';
    let fallbackReason: FallbackReason | undefined;
    let errorDetail: string | undefined;

    if (useFallback) {
      options = buildFallbackOptions();
      fallbackReason = 'user_choice';
      debugLog('design-options: using fallback (reason=user_choice)');
    } else {
      const claude = getClaudeProvider();

      if (!claude) {
        options = buildFallbackOptions();
        fallbackReason = 'no_api_key';
        debugLog('design-options: using fallback (reason=no_api_key) — no ANTHROPIC_API_KEY or Vertex AI configured');
      } else {
        try {
          options = await generateOptionsViaLLM(claude.provider, {
            appName,
            description: description ?? '',
            targetAudience: targetAudience ?? '',
            prdContent,
            colorScheme,
          });
          source = 'llm';
          debugLog(`design-options: LLM generation succeeded (auth=${claude.authMethod})`);
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          console.error('LLM design options generation failed, using fallback:', detail);
          debugLog(`design-options: using fallback (reason=llm_error, detail=${detail})`);
          options = buildFallbackOptions();
          fallbackReason = 'llm_error';
          errorDetail = detail;
        }
      }
    }

    // Generate preview HTML and inject iframe communication script
    let previewHtml = generatePreviewHtml(appName, options);
    previewHtml = injectIframeCommunication(previewHtml);

    return NextResponse.json({ previewHtml, options, source, fallbackReason, errorDetail });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** Call Claude via provider to generate design options (supports both direct API and Vertex AI). */
async function generateOptionsViaLLM(
  provider: import('@agentforge/providers').LLMProvider,
  context: { appName: string; description: string; targetAudience: string; prdContent?: string; colorScheme?: 'light' | 'dark' | 'both' },
): Promise<DesignOption[]> {
  const effectiveAudience = (context.targetAudience && context.targetAudience !== 'general')
    ? context.targetAudience
    : extractAudienceFromPrd(context.prdContent);

  const appContext = context.prdContent
    ? `- App name: ${context.appName}\n- Target audience: ${effectiveAudience}\n\nPRD:\n${context.prdContent}`
    : `- App name: ${context.appName}\n- Description: ${context.description || 'A web application'}\n- Target audience: ${effectiveAudience}`;

  const schemeConstraint = context.colorScheme && context.colorScheme !== 'both'
    ? `\n\nCOLOR SCHEME CONSTRAINT: The user selected "${context.colorScheme}" mode. All 3 options MUST use a ${context.colorScheme} color scheme. For light: background-primary must be a light color (white, off-white, cream — luminance >= #F0F0F0). For dark: background-primary must be a dark color (charcoal, near-black — luminance <= #1A1A1A).`
    : '';

  const systemPrompt = `You are a design system expert creating contemporary, production-quality design systems. Generate 3 distinct design direction options for a web application.

Each option MUST feel genuinely different from the others — not 3 variations of the same mood.
Vary across these axes: color temperature (warm vs cool vs neutral), energy level (calm vs energetic vs bold), aesthetic era (classic vs contemporary vs futuristic), and personality (playful vs serious vs elegant).

IMPORTANT: Do NOT default to the same 3 categories every time (e.g. always "professional", "warm", "bold"). Surprise the user with unexpected directions like minimalist-zen, nature-inspired, editorial, nordic, tropical, etc. Tailor the directions to the app's purpose and audience.

Modern design guidance:
- Use contemporary typefaces popular in 2024-2025 design. Prefer: Inter, Plus Jakarta Sans, DM Sans, Geist, Satoshi, Manrope, Outfit, Sora, Figtree. Avoid dated/retro condensed display fonts (Bebas Neue, Impact, Oswald, Russo One) unless the direction specifically calls for retro aesthetic.
- Color palettes should feel current and polished. For light themes: warm whites, subtle grays, one vibrant accent. For dark themes: deep neutrals (not pure black #000), muted or refined accents — avoid gaming/crypto aesthetics (amber-on-black, neon-on-dark).
- Typography scale should have visual impact: heading-1 >= 36px, body >= 15px.
- Elevation shadows should be subtle and color-tinted (tint shadows toward the brand color), not uniform grayscale rgba(0,0,0,0.x).

Rules:
- 5-8 primitive colors per option, using kebab-case names (e.g. "deep-teal", "warm-cream")
- Semantic color values should reference primitive color names (except overlay which is an rgba value)
- Use real Google Fonts that pair well
- Ensure sufficient contrast between background-primary and text-primary (WCAG AA)
- Elevation shadows should feel cohesive with the design direction (4 levels: flat, cards, dropdowns, modals)${schemeConstraint}

Return a JSON object with an "options" array of 3 objects, each with:
- label: string (creative, evocative name — e.g. "Nordic Clarity", "Sunset Studio", "Electric Ink")
- vibe: string (short description)
- colors: { primitive: Record<string, string>, semantic: Record<string, string> with keys: background-primary, surface-primary, surface-elevated, surface-secondary, surface-input, text-primary, text-secondary, text-disabled, text-on-cta, cta-primary, cta-hover, border-default, border-focus, border-error, error, success, warning, info, overlay }
- fonts: { display: string, body: string }
- brand: { tone: string, illustrationDirection: string, illustrationDescription: string, motionFeel: "snappy"|"smooth"|"bouncy"|"subtle" }
- elevation: { levels: [{ level: number, shadow: string, description: string }] }`;

  const result = await provider.complete(
    {
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Generate 3 design system options for:\n${appContext}`,
        },
      ],
    },
    {
      model: 'claude-sonnet-4-6',
      maxTokens: 8192,
      temperature: 0.9,
    },
  );

  if (!result.ok) {
    const error = result.error;
    throw new Error(`Provider error (${error.code}): ${'message' in error ? error.message : JSON.stringify(error)}`);
  }

  const content = result.value.content;
  if (!content) {
    throw new Error('No text content in LLM response');
  }

  const cleaned = content.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
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

/** Extract target audience from PRD text when not explicitly provided. */
function extractAudienceFromPrd(prdContent?: string): string {
  if (!prdContent) return 'general users';
  const patterns = [
    /target\s+audience[:\s]+([^\n.]+)/i,
    /intended\s+(?:for|users?)[:\s]+([^\n.]+)/i,
    /(?:primary|target)\s+users?[:\s]+([^\n.]+)/i,
    /persona[s]?[:\s]+([^\n.]+)/i,
  ];
  for (const pattern of patterns) {
    const match = prdContent.match(pattern);
    if (match?.[1]) {
      const audience = match[1].trim();
      if (audience.length > 5 && audience.length < 200) return audience;
    }
  }
  return 'general users';
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
