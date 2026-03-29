import { Ok } from "@agentforge/core";
import type { Result } from "@agentforge/core";
import { CompletionOptions, CompletionResult, Prompt, ProviderError } from "@agentforge/providers";
const val = {
    ok: true,
    value: {
        content: "{\"options\":[{\"label\":\"Serene Light\",\"vibe\":\"Clean, airy, and minimal — a calm productivity sanctuary with soft whites and gentle indigo accents that never overwhelm.\",\"colors\":{\"primitive\":[{\"name\":\"deep-indigo\",\"hex\":\"#4F46E5\"},{\"name\":\"light-indigo\",\"hex\":\"#E0E7FF\"},{\"name\":\"pale-indigo\",\"hex\":\"#EEF2FF\"},{\"name\":\"slate-dark\",\"hex\":\"#0F172A\"},{\"name\":\"slate-mid\",\"hex\":\"#64748B\"},{\"name\":\"slate-light\",\"hex\":\"#F1F5F9\"},{\"name\":\"emerald\",\"hex\":\"#10B981\"},{\"name\":\"pure-white\",\"hex\":\"#FFFFFF\"}],\"semantic\":{\"background-primary\":\"slate-light\",\"surface-primary\":\"pure-white\",\"surface-elevated\":\"pure-white\",\"text-primary\":\"slate-dark\",\"text-secondary\":\"slate-mid\",\"text-disabled\":\"slate-mid\",\"text-on-cta\":\"pure-white\",\"cta-primary\":\"deep-indigo\",\"cta-hover\":\"#4338CA\",\"border-default\":\"#E2E8F0\",\"border-focus\":\"deep-indigo\",\"border-error\":\"#F43F5E\",\"error\":\"#F43F5E\",\"success\":\"emerald\",\"warning\":\"#F59E0B\",\"info\":\"deep-indigo\",\"overlay\":\"rgba(15,23,42,0.45)\",\"surface-secondary\":\"slate-light\",\"surface-input\":\"pure-white\"}},\"fonts\":{\"display\":\"Inter\",\"body\":\"Inter\"},\"brand\":{\"tone\":\"Calm, focused, and trustworthy. Clear hierarchy with generous whitespace that invites stillness. Language is warm but efficient.\",\"illustrationDirection\":\"Minimal line art with soft indigo and slate tones. Simple geometric forms — circles, arcs, breath curves. No clutter.\",\"illustrationDescription\":\"Thin-stroke circular motifs echoing the timer ring. Gentle gradient fills from pale-indigo to white. Sparse negative space as a design element.\",\"motionFeel\":\"smooth\"},\"elevation\":{\"levels\":[{\"level\":0,\"shadow\":\"none\",\"description\":\"Flat — page background, no elevation\"},{\"level\":1,\"shadow\":\"0 1px 3px rgba(0,0,0,0.08)\",\"description\":\"Cards — session type cards, stat cards\"},{\"level\":2,\"shadow\":\"0 4px 12px rgba(0,0,0,0.10)\",\"description\":\"Dropdowns — custom duration reveal, popovers\"},{\"level\":3,\"shadow\":\"0 8px 24px rgba(0,0,0,0.12)\",\"description\":\"Modals — settings dialog, elevated overlays\"}]}},{\"label\":\"Midnight Focus\",\"vibe\":\"Dark, immersive, and deeply focused — a night-mode sanctuary that feels like entering a flow state the moment you open it.\",\"colors\":{\"primitive\":[{\"name\":\"void-black\",\"hex\":\"#0A0F1E\"},{\"name\":\"deep-navy\",\"hex\":\"#111827\"},{\"name\":\"surface-navy\",\"hex\":\"#1C2333\"},{\"name\":\"muted-navy\",\"hex\":\"#253047\"},{\"name\":\"soft-indigo\",\"hex\":\"#818CF8\"},{\"name\":\"pale-indigo\",\"hex\":\"#312E81\"},{\"name\":\"moon-white\",\"hex\":\"#E2E8F0\"},{\"name\":\"ghost-white\",\"hex\":\"#94A3B8\"}],\"semantic\":{\"background-primary\":\"void-black\",\"surface-primary\":\"deep-navy\",\"surface-elevated\":\"surface-navy\",\"text-primary\":\"moon-white\",\"text-secondary\":\"ghost-white\",\"text-disabled\":\"#475569\",\"text-on-cta\":\"moon-white\",\"cta-primary\":\"soft-indigo\",\"cta-hover\":\"#6366F1\",\"border-default\":\"muted-navy\",\"border-focus\":\"soft-indigo\",\"border-error\":\"#FB7185\",\"error\":\"#FB7185\",\"success\":\"#34D399\",\"warning\":\"#FCD34D\",\"info\":\"soft-indigo\",\"overlay\":\"rgba(0,0,0,0.65)\",\"surface-secondary\":\"surface-navy\",\"surface-input\":\"muted-navy\"}},\"fonts\":{\"display\":\"Space Grotesk\",\"body\":\"Inter\"},\"brand\":{\"tone\":\"Focused, introspective, and powerful. Minimal words, maximum presence. The interface recedes so the mind can expand.\",\"illustrationDirection\":\"Deep space aesthetic — dark backgrounds with glowing indigo and violet accents. Subtle particle or starfield textures. Circular glows around the timer ring.\",\"illustrationDescription\":\"Soft luminous rings on dark canvas, thin neon-indigo strokes, gentle radial gradients emanating from center. Feels like bioluminescence or distant stars.\",\"motionFeel\":\"subtle\"},\"elevation\":{\"levels\":[{\"level\":0,\"shadow\":\"none\",\"description\":\"Flat — void background, base layer\"},{\"level\":1,\"shadow\":\"0 1px 4px rgba(0,0,0,0.4)\",\"description\":\"Cards — session cards with dark lift\"},{\"level\":2,\"shadow\":\"0 4px 16px rgba(0,0,0,0.5)\",\"description\":\"Dropdowns — popovers floating on dark surface\"},{\"level\":3,\"shadow\":\"0 12px 40px rgba(0,0,0,0.65)\",\"description\":\"Modals — settings dialog with deep dark shadow\"}]}},{\"label\":\"Warm Zen\",\"vibe\":\"Earthy, organic, and human — warm sand tones with terracotta accents that feel like a meditation retreat rather than a productivity app.\",\"colors\":{\"primitive\":[{\"name\":\"warm-sand\",\"hex\":\"#F5F0E8\"},{\"name\":\"soft-cream\",\"hex\":\"#FDFAF5\"},{\"name\":\"muted-cream\",\"hex\":\"#EDE8DE\"},{\"name\":\"terracotta\",\"hex\":\"#C4622D\"},{\"name\":\"terracotta-light\",\"hex\":\"#F3DDD1\"},{\"name\":\"charcoal\",\"hex\":\"#2C2416\"},{\"name\":\"warm-stone\",\"hex\":\"#7C6F5B\"},{\"name\":\"sage\",\"hex\":\"#5A7A5F\"}],\"semantic\":{\"background-primary\":\"warm-sand\",\"surface-primary\":\"soft-cream\",\"surface-elevated\":\"soft-cream\",\"text-primary\":\"charcoal\",\"text-secondary\":\"warm-stone\",\"text-disabled\":\"#B0A594\",\"text-on-cta\":\"soft-cream\",\"cta-primary\":\"terracotta\",\"cta-hover\":\"#A8501F\",\"border-default\":\"muted-cream\",\"border-focus\":\"terracotta\",\"border-error\":\"#C0392B\",\"error\":\"#C0392B\",\"success\":\"sage\",\"warning\":\"#D4882A\",\"info\":\"terracotta\",\"overlay\":\"rgba(44,36,22,0.45)\",\"surface-secondary\":\"muted-cream\",\"surface-input\":\"soft-cream\"}},\"fonts\":{\"display\":\"Playfair Display\",\"body\":\"Source Sans 3\"},\"brand\":{\"tone\":\"Grounded, nurturing, and unhurried. Speaks like a wise friend — never clinical. Encourages without pressure. Celebrates small moments.\",\"illustrationDirection\":\"Organic, hand-crafted aesthetic. Warm watercolor washes, botanical line art, gentle brushstroke textures. Earthy palette with occasional sage green accents.\",\"illustrationDescription\":\"Loose ink-brush circles for the timer ring. Subtle paper texture overlays. Leaf or stone motifs as ambient decoration. Feels handmade and intentional.\",\"motionFeel\":\"bouncy\"},\"elevation\":{\"levels\":[{\"level\":0,\"shadow\":\"none\",\"description\":\"Flat — warm sand background, grounded base\"},{\"level\":1,\"shadow\":\"0 1px 4px rgba(44,36,22,0.07)\",\"description\":\"Cards — session cards with warm lift\"},{\"level\":2,\"shadow\":\"0 4px 14px rgba(44,36,22,0.10)\",\"description\":\"Dropdowns — popovers with warm depth\"},{\"level\":3,\"shadow\":\"0 10px 32px rgba(44,36,22,0.14)\",\"description\":\"Modals — settings dialog with earthy shadow\"}]}}]}",
        toolCalls: [
        ],
        usage: {
            inputTokens: 7673,
            outputTokens: 1906,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
        },
        cost: {
            inputCostUsd: 0.023019,
            outputCostUsd: 0.028589999999999997,
            totalCostUsd: 0.051609,
            model: "claude-sonnet-4-6",
            timestamp: "2026-03-29T05:11:38.958Z",
        },
        model: "claude-sonnet-4-6",
        latencyMs: 33767,
        finishReason: "stop",
        structured: {
            options: [
                {
                    label: "Serene Light",
                    vibe: "Clean, airy, and minimal — a calm productivity sanctuary with soft whites and gentle indigo accents that never overwhelm.",
                    colors: {
                        primitive: [
                            {
                                name: "deep-indigo",
                                hex: "#4F46E5",
                            },
                            {
                                name: "light-indigo",
                                hex: "#E0E7FF",
                            },
                            {
                                name: "pale-indigo",
                                hex: "#EEF2FF",
                            },
                            {
                                name: "slate-dark",
                                hex: "#0F172A",
                            },
                            {
                                name: "slate-mid",
                                hex: "#64748B",
                            },
                            {
                                name: "slate-light",
                                hex: "#F1F5F9",
                            },
                            {
                                name: "emerald",
                                hex: "#10B981",
                            },
                            {
                                name: "pure-white",
                                hex: "#FFFFFF",
                            },
                        ],
                        semantic: {
                            "background-primary": "slate-light",
                            "surface-primary": "pure-white",
                            "surface-elevated": "pure-white",
                            "text-primary": "slate-dark",
                            "text-secondary": "slate-mid",
                            "text-disabled": "slate-mid",
                            "text-on-cta": "pure-white",
                            "cta-primary": "deep-indigo",
                            "cta-hover": "#4338CA",
                            "border-default": "#E2E8F0",
                            "border-focus": "deep-indigo",
                            "border-error": "#F43F5E",
                            error: "#F43F5E",
                            success: "emerald",
                            warning: "#F59E0B",
                            info: "deep-indigo",
                            overlay: "rgba(15,23,42,0.45)",
                            "surface-secondary": "slate-light",
                            "surface-input": "pure-white",
                        },
                    },
                    fonts: {
                        display: "Inter",
                        body: "Inter",
                    },
                    brand: {
                        tone: "Calm, focused, and trustworthy. Clear hierarchy with generous whitespace that invites stillness. Language is warm but efficient.",
                        illustrationDirection: "Minimal line art with soft indigo and slate tones. Simple geometric forms — circles, arcs, breath curves. No clutter.",
                        illustrationDescription: "Thin-stroke circular motifs echoing the timer ring. Gentle gradient fills from pale-indigo to white. Sparse negative space as a design element.",
                        motionFeel: "smooth",
                    },
                    elevation: {
                        levels: [
                            {
                                level: 0,
                                shadow: "none",
                                description: "Flat — page background, no elevation",
                            },
                            {
                                level: 1,
                                shadow: "0 1px 3px rgba(0,0,0,0.08)",
                                description: "Cards — session type cards, stat cards",
                            },
                            {
                                level: 2,
                                shadow: "0 4px 12px rgba(0,0,0,0.10)",
                                description: "Dropdowns — custom duration reveal, popovers",
                            },
                            {
                                level: 3,
                                shadow: "0 8px 24px rgba(0,0,0,0.12)",
                                description: "Modals — settings dialog, elevated overlays",
                            },
                        ],
                    },
                },
                {
                    label: "Midnight Focus",
                    vibe: "Dark, immersive, and deeply focused — a night-mode sanctuary that feels like entering a flow state the moment you open it.",
                    colors: {
                        primitive: [
                            {
                                name: "void-black",
                                hex: "#0A0F1E",
                            },
                            {
                                name: "deep-navy",
                                hex: "#111827",
                            },
                            {
                                name: "surface-navy",
                                hex: "#1C2333",
                            },
                            {
                                name: "muted-navy",
                                hex: "#253047",
                            },
                            {
                                name: "soft-indigo",
                                hex: "#818CF8",
                            },
                            {
                                name: "pale-indigo",
                                hex: "#312E81",
                            },
                            {
                                name: "moon-white",
                                hex: "#E2E8F0",
                            },
                            {
                                name: "ghost-white",
                                hex: "#94A3B8",
                            },
                        ],
                        semantic: {
                            "background-primary": "void-black",
                            "surface-primary": "deep-navy",
                            "surface-elevated": "surface-navy",
                            "text-primary": "moon-white",
                            "text-secondary": "ghost-white",
                            "text-disabled": "#475569",
                            "text-on-cta": "moon-white",
                            "cta-primary": "soft-indigo",
                            "cta-hover": "#6366F1",
                            "border-default": "muted-navy",
                            "border-focus": "soft-indigo",
                            "border-error": "#FB7185",
                            error: "#FB7185",
                            success: "#34D399",
                            warning: "#FCD34D",
                            info: "soft-indigo",
                            overlay: "rgba(0,0,0,0.65)",
                            "surface-secondary": "surface-navy",
                            "surface-input": "muted-navy",
                        },
                    },
                    fonts: {
                        display: "Space Grotesk",
                        body: "Inter",
                    },
                    brand: {
                        tone: "Focused, introspective, and powerful. Minimal words, maximum presence. The interface recedes so the mind can expand.",
                        illustrationDirection: "Deep space aesthetic — dark backgrounds with glowing indigo and violet accents. Subtle particle or starfield textures. Circular glows around the timer ring.",
                        illustrationDescription: "Soft luminous rings on dark canvas, thin neon-indigo strokes, gentle radial gradients emanating from center. Feels like bioluminescence or distant stars.",
                        motionFeel: "subtle",
                    },
                    elevation: {
                        levels: [
                            {
                                level: 0,
                                shadow: "none",
                                description: "Flat — void background, base layer",
                            },
                            {
                                level: 1,
                                shadow: "0 1px 4px rgba(0,0,0,0.4)",
                                description: "Cards — session cards with dark lift",
                            },
                            {
                                level: 2,
                                shadow: "0 4px 16px rgba(0,0,0,0.5)",
                                description: "Dropdowns — popovers floating on dark surface",
                            },
                            {
                                level: 3,
                                shadow: "0 12px 40px rgba(0,0,0,0.65)",
                                description: "Modals — settings dialog with deep dark shadow",
                            },
                        ],
                    },
                },
                {
                    label: "Warm Zen",
                    vibe: "Earthy, organic, and human — warm sand tones with terracotta accents that feel like a meditation retreat rather than a productivity app.",
                    colors: {
                        primitive: [
                            {
                                name: "warm-sand",
                                hex: "#F5F0E8",
                            },
                            {
                                name: "soft-cream",
                                hex: "#FDFAF5",
                            },
                            {
                                name: "muted-cream",
                                hex: "#EDE8DE",
                            },
                            {
                                name: "terracotta",
                                hex: "#C4622D",
                            },
                            {
                                name: "terracotta-light",
                                hex: "#F3DDD1",
                            },
                            {
                                name: "charcoal",
                                hex: "#2C2416",
                            },
                            {
                                name: "warm-stone",
                                hex: "#7C6F5B",
                            },
                            {
                                name: "sage",
                                hex: "#5A7A5F",
                            },
                        ],
                        semantic: {
                            "background-primary": "warm-sand",
                            "surface-primary": "soft-cream",
                            "surface-elevated": "soft-cream",
                            "text-primary": "charcoal",
                            "text-secondary": "warm-stone",
                            "text-disabled": "#B0A594",
                            "text-on-cta": "soft-cream",
                            "cta-primary": "terracotta",
                            "cta-hover": "#A8501F",
                            "border-default": "muted-cream",
                            "border-focus": "terracotta",
                            "border-error": "#C0392B",
                            error: "#C0392B",
                            success: "sage",
                            warning: "#D4882A",
                            info: "terracotta",
                            overlay: "rgba(44,36,22,0.45)",
                            "surface-secondary": "muted-cream",
                            "surface-input": "soft-cream",
                        },
                    },
                    fonts: {
                        display: "Playfair Display",
                        body: "Source Sans 3",
                    },
                    brand: {
                        tone: "Grounded, nurturing, and unhurried. Speaks like a wise friend — never clinical. Encourages without pressure. Celebrates small moments.",
                        illustrationDirection: "Organic, hand-crafted aesthetic. Warm watercolor washes, botanical line art, gentle brushstroke textures. Earthy palette with occasional sage green accents.",
                        illustrationDescription: "Loose ink-brush circles for the timer ring. Subtle paper texture overlays. Leaf or stone motifs as ambient decoration. Feels handmade and intentional.",
                        motionFeel: "bouncy",
                    },
                    elevation: {
                        levels: [
                            {
                                level: 0,
                                shadow: "none",
                                description: "Flat — warm sand background, grounded base",
                            },
                            {
                                level: 1,
                                shadow: "0 1px 4px rgba(44,36,22,0.07)",
                                description: "Cards — session cards with warm lift",
                            },
                            {
                                level: 2,
                                shadow: "0 4px 14px rgba(44,36,22,0.10)",
                                description: "Dropdowns — popovers with warm depth",
                            },
                            {
                                level: 3,
                                shadow: "0 10px 32px rgba(44,36,22,0.14)",
                                description: "Modals — settings dialog with earthy shadow",
                            },
                        ],
                    },
                },
            ],
        },
    },
}
/** Recorded `CompletionResult` shape (inner payload only — outer `Ok` is applied below). */
const mockCompletionResult = val.value as CompletionResult;

/** Fixture matching `provider.complete` for local debugging. */
export function generateDesignOptionsMock(prompt: Prompt, opts: CompletionOptions): Promise<Result<CompletionResult, ProviderError>> {
    return Promise.resolve(Ok(mockCompletionResult));
}