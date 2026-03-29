import { Ok } from "@agentforge/core";
import type { Result } from "@agentforge/core";
import { CompletionOptions, CompletionResult, Prompt, ProviderError } from "@agentforge/providers";

const val = {
    ok: true,
    value: {
        content: "{\"options\":[{\"label\":\"Serene Light\",\"vibe\":\"Clean, airy, and minimal — like a morning meditation space with soft natural light. Calm indigo accents against crisp whites and cool grays.\",\"colors\":{\"primitive\":[{\"name\":\"indigo-600\",\"hex\":\"#4F46E5\"},{\"name\":\"indigo-100\",\"hex\":\"#E0E7FF\"},{\"name\":\"indigo-50\",\"hex\":\"#EEF2FF\"},{\"name\":\"slate-900\",\"hex\":\"#0F172A\"},{\"name\":\"slate-500\",\"hex\":\"#64748B\"},{\"name\":\"slate-100\",\"hex\":\"#F1F5F9\"},{\"name\":\"emerald-500\",\"hex\":\"#10B981\"},{\"name\":\"rose-500\",\"hex\":\"#F43F5E\"},{\"name\":\"amber-500\",\"hex\":\"#F59E0B\"}],\"semantic\":{\"background-primary\":\"slate-100\",\"surface-primary\":\"#FFFFFF\",\"surface-elevated\":\"#FFFFFF\",\"text-primary\":\"slate-900\",\"text-secondary\":\"slate-500\",\"text-disabled\":\"#94A3B8\",\"text-on-cta\":\"#FFFFFF\",\"cta-primary\":\"indigo-600\",\"cta-hover\":\"#4338CA\",\"border-default\":\"#E2E8F0\",\"border-focus\":\"indigo-600\",\"border-error\":\"rose-500\",\"error\":\"rose-500\",\"success\":\"emerald-500\",\"warning\":\"amber-500\",\"info\":\"indigo-600\",\"overlay\":\"rgba(15,23,42,0.4)\",\"surface-secondary\":\"#F8FAFC\",\"surface-input\":\"#FFFFFF\"}},\"fonts\":{\"display\":\"Inter\",\"body\":\"Inter\"},\"brand\":{\"tone\":\"Calm, focused, and welcoming. Quiet confidence without sterility. Every word earns its place.\",\"illustrationDirection\":\"Minimal line illustrations — thin strokes, generous whitespace, soft indigo and slate tones. No gradients. Iconography is outlined and purposeful.\",\"illustrationDescription\":\"Simple circular motifs and breathing wave forms rendered in single-weight lines. Soft indigo on white backgrounds. Think Headspace meets Linear.\",\"motionFeel\":\"smooth\"},\"elevation\":{\"levels\":[{\"level\":0,\"shadow\":\"none\",\"description\":\"Flat — page background, inactive chips\"},{\"level\":1,\"shadow\":\"0 1px 3px rgba(0,0,0,0.08)\",\"description\":\"Cards, session type tiles, stat cards\"},{\"level\":2,\"shadow\":\"0 4px 12px rgba(0,0,0,0.10)\",\"description\":\"Dropdowns, popovers, selected cards elevated\"},{\"level\":3,\"shadow\":\"0 8px 24px rgba(0,0,0,0.12)\",\"description\":\"Modals, settings dialog, overlay surfaces\"}]},\"extras\":\"{\\\"typography_scale\\\":[{\\\"role\\\":\\\"heading-1\\\",\\\"size\\\":\\\"24px\\\",\\\"weight\\\":\\\"700\\\",\\\"family\\\":\\\"Inter\\\",\\\"line_height\\\":\\\"1.3\\\"},{\\\"role\\\":\\\"heading-2\\\",\\\"size\\\":\\\"16px\\\",\\\"weight\\\":\\\"600\\\",\\\"family\\\":\\\"Inter\\\",\\\"line_height\\\":\\\"1.4\\\"},{\\\"role\\\":\\\"heading-3\\\",\\\"size\\\":\\\"15px\\\",\\\"weight\\\":\\\"600\\\",\\\"family\\\":\\\"Inter\\\",\\\"line_height\\\":\\\"1.4\\\"},{\\\"role\\\":\\\"body\\\",\\\"size\\\":\\\"14px\\\",\\\"weight\\\":\\\"400\\\",\\\"family\\\":\\\"Inter\\\",\\\"line_height\\\":\\\"1.5\\\"},{\\\"role\\\":\\\"label\\\",\\\"size\\\":\\\"12px\\\",\\\"weight\\\":\\\"500\\\",\\\"family\\\":\\\"Inter\\\",\\\"line_height\\\":\\\"1.4\\\"},{\\\"role\\\":\\\"small\\\",\\\"size\\\":\\\"64px\\\",\\\"weight\\\":\\\"300\\\",\\\"family\\\":\\\"Inter\\\",\\\"line_height\\\":\\\"1\\\"}],\\\"borders\\\":{\\\"radius\\\":{\\\"small\\\":8,\\\"medium\\\":12,\\\"large\\\":16,\\\"pill\\\":9999}},\\\"motion\\\":{\\\"durations\\\":{\\\"fast\\\":\\\"150ms\\\",\\\"normal\\\":\\\"250ms\\\",\\\"slow\\\":\\\"350ms\\\"},\\\"easings\\\":{\\\"default\\\":\\\"ease-in-out\\\",\\\"emphasized\\\":\\\"cubic-bezier(0.34,1.56,0.64,1)\\\"}},\\\"preview\\\":{\\\"metrics\\\":[{\\\"label\\\":\\\"🔥 Streak\\\",\\\"value\\\":\\\"12 days\\\",\\\"trend\\\":\\\"+1 today\\\"},{\\\"label\\\":\\\"⏱ This Week\\\",\\\"value\\\":\\\"4.2 hrs\\\",\\\"trend\\\":\\\"+0.8 hrs\\\"},{\\\"label\\\":\\\"🧘 Sessions\\\",\\\"value\\\":\\\"38\\\",\\\"trend\\\":\\\"+3 this week\\\"}],\\\"table_rows\\\":[{\\\"name\\\":\\\"Deep Work\\\",\\\"status\\\":\\\"Completed\\\",\\\"amount\\\":\\\"25 min\\\",\\\"date\\\":\\\"Today, 9:00 AM\\\"},{\\\"name\\\":\\\"Meditation\\\",\\\"status\\\":\\\"Completed\\\",\\\"amount\\\":\\\"15 min\\\",\\\"date\\\":\\\"Yesterday, 8:30 AM\\\"},{\\\"name\\\":\\\"Power Nap\\\",\\\"status\\\":\\\"Ended Early\\\",\\\"amount\\\":\\\"5 min\\\",\\\"date\\\":\\\"Mar 26, 2:00 PM\\\"},{\\\"name\\\":\\\"Deep Work\\\",\\\"status\\\":\\\"Completed\\\",\\\"amount\\\":\\\"45 min\\\",\\\"date\\\":\\\"Mar 25, 10:00 AM\\\"}],\\\"nav_items\\\":[\\\"Session\\\",\\\"Timer\\\",\\\"Summary\\\",\\\"Settings\\\"]}}\"},{\"label\":\"Midnight Depth\",\"vibe\":\"Deep, immersive dark mode — like a candlelit study at midnight. Rich navy surfaces with luminous indigo glows and warm accent highlights.\",\"colors\":{\"primitive\":[{\"name\":\"navy-950\",\"hex\":\"#0A0F1E\"},{\"name\":\"navy-800\",\"hex\":\"#131C35\"},{\"name\":\"navy-700\",\"hex\":\"#1A2545\"},{\"name\":\"indigo-400\",\"hex\":\"#818CF8\"},{\"name\":\"indigo-300\",\"hex\":\"#A5B4FC\"},{\"name\":\"slate-300\",\"hex\":\"#CBD5E1\"},{\"name\":\"slate-500\",\"hex\":\"#64748B\"},{\"name\":\"emerald-400\",\"hex\":\"#34D399\"},{\"name\":\"amber-400\",\"hex\":\"#FBBF24\"},{\"name\":\"rose-400\",\"hex\":\"#FB7185\"}],\"semantic\":{\"background-primary\":\"navy-950\",\"surface-primary\":\"navy-800\",\"surface-elevated\":\"navy-700\",\"text-primary\":\"slate-300\",\"text-secondary\":\"slate-500\",\"text-disabled\":\"#334155\",\"text-on-cta\":\"#0A0F1E\",\"cta-primary\":\"indigo-400\",\"cta-hover\":\"indigo-300\",\"border-default\":\"#1E2D50\",\"border-focus\":\"indigo-400\",\"border-error\":\"rose-400\",\"error\":\"rose-400\",\"success\":\"emerald-400\",\"warning\":\"amber-400\",\"info\":\"indigo-300\",\"overlay\":\"rgba(0,0,0,0.65)\",\"surface-secondary\":\"#0E1528\",\"surface-input\":\"navy-700\"}},\"fonts\":{\"display\":\"DM Sans\",\"body\":\"DM Sans\"},\"brand\":{\"tone\":\"Focused and introspective. A quiet sanctuary from the noise. Premium, unhurried, and deeply intentional.\",\"illustrationDirection\":\"Glowing circular orbs and soft radial gradients on dark backgrounds. Thin luminous lines suggesting breath and energy. Deep indigo to violet hues.\",\"illustrationDescription\":\"Concentric rings with soft glow effects, like a sonar pulse in deep water. Ambient particles and gradient rings evoke depth and calm focus.\",\"motionFeel\":\"subtle\"},\"elevation\":{\"levels\":[{\"level\":0,\"shadow\":\"none\",\"description\":\"Flat — page background, inactive elements\"},{\"level\":1,\"shadow\":\"0 1px 4px rgba(0,0,0,0.3)\",\"description\":\"Cards and surface tiles on dark background\"},{\"level\":2,\"shadow\":\"0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(129,140,248,0.08)\",\"description\":\"Dropdowns, popovers with subtle indigo rim\"},{\"level\":3,\"shadow\":\"0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(129,140,248,0.12)\",\"description\":\"Modals with deep shadow and faint glow border\"}]},\"extras\":\"{\\\"typography_scale\\\":[{\\\"role\\\":\\\"heading-1\\\",\\\"size\\\":\\\"24px\\\",\\\"weight\\\":\\\"600\\\",\\\"family\\\":\\\"DM Sans\\\",\\\"line_height\\\":\\\"1.3\\\"},{\\\"role\\\":\\\"heading-2\\\",\\\"size\\\":\\\"16px\\\",\\\"weight\\\":\\\"600\\\",\\\"family\\\":\\\"DM Sans\\\",\\\"line_height\\\":\\\"1.4\\\"},{\\\"role\\\":\\\"heading-3\\\",\\\"size\\\":\\\"15px\\\",\\\"weight\\\":\\\"500\\\",\\\"family\\\":\\\"DM Sans\\\",\\\"line_height\\\":\\\"1.4\\\"},{\\\"role\\\":\\\"body\\\",\\\"size\\\":\\\"14px\\\",\\\"weight\\\":\\\"400\\\",\\\"family\\\":\\\"DM Sans\\\",\\\"line_height\\\":\\\"1.6\\\"},{\\\"role\\\":\\\"label\\\",\\\"size\\\":\\\"12px\\\",\\\"weight\\\":\\\"500\\\",\\\"family\\\":\\\"DM Sans\\\",\\\"line_height\\\":\\\"1.4\\\"},{\\\"role\\\":\\\"small\\\",\\\"size\\\":\\\"64px\\\",\\\"weight\\\":\\\"300\\\",\\\"family\\\":\\\"DM Sans\\\",\\\"line_height\\\":\\\"1\\\"}],\\\"borders\\\":{\\\"radius\\\":{\\\"small\\\":8,\\\"medium\\\":12,\\\"large\\\":16,\\\"pill\\\":9999}},\\\"motion\\\":{\\\"durations\\\":{\\\"fast\\\":\\\"150ms\\\",\\\"normal\\\":\\\"300ms\\\",\\\"slow\\\":\\\"400ms\\\"},\\\"easings\\\":{\\\"default\\\":\\\"ease-in-out\\\",\\\"emphasized\\\":\\\"cubic-bezier(0.4,0,0.2,1)\\\"}},\\\"preview\\\":{\\\"metrics\\\":[{\\\"label\\\":\\\"🔥 Streak\\\",\\\"value\\\":\\\"12 days\\\",\\\"trend\\\":\\\"+1 today\\\"},{\\\"label\\\":\\\"⏱ This Week\\\",\\\"value\\\":\\\"4.2 hrs\\\",\\\"trend\\\":\\\"+0.8 hrs\\\"},{\\\"label\\\":\\\"🧘 Sessions\\\",\\\"value\\\":\\\"38\\\",\\\"trend\\\":\\\"+3 this week\\\"}],\\\"table_rows\\\":[{\\\"name\\\":\\\"Deep Work\\\",\\\"status\\\":\\\"Completed\\\",\\\"amount\\\":\\\"25 min\\\",\\\"date\\\":\\\"Today, 9:00 AM\\\"},{\\\"name\\\":\\\"Meditation\\\",\\\"status\\\":\\\"Completed\\\",\\\"amount\\\":\\\"15 min\\\",\\\"date\\\":\\\"Yesterday, 8:30 AM\\\"},{\\\"name\\\":\\\"Power Nap\\\",\\\"status\\\":\\\"Ended Early\\\",\\\"amount\\\":\\\"5 min\\\",\\\"date\\\":\\\"Mar 26, 2:00 PM\\\"},{\\\"name\\\":\\\"Deep Work\\\",\\\"status\\\":\\\"Completed\\\",\\\"amount\\\":\\\"45 min\\\",\\\"date\\\":\\\"Mar 25, 10:00 AM\\\"}],\\\"nav_items\\\":[\\\"Session\\\",\\\"Timer\\\",\\\"Summary\\\",\\\"Settings\\\"]}}\"},{\"label\":\"Warm Pebble\",\"vibe\":\"Organic, warm, and grounding — like a zen garden at golden hour. Sandy neutrals and sage greens with terracotta accents evoke natural calm.\",\"colors\":{\"primitive\":[{\"name\":\"warm-sand\",\"hex\":\"#F5F0E8\"},{\"name\":\"pebble-100\",\"hex\":\"#EDE8DF\"},{\"name\":\"stone-800\",\"hex\":\"#292520\"},{\"name\":\"stone-500\",\"hex\":\"#78716C\"},{\"name\":\"sage-600\",\"hex\":\"#4A7C6F\"},{\"name\":\"sage-200\",\"hex\":\"#C8DDD9\"},{\"name\":\"terracotta-500\",\"hex\":\"#C2714F\"},{\"name\":\"amber-warm\",\"hex\":\"#D4A843\"}],\"semantic\":{\"background-primary\":\"warm-sand\",\"surface-primary\":\"#FFFDF8\",\"surface-elevated\":\"#FFFFFF\",\"text-primary\":\"stone-800\",\"text-secondary\":\"stone-500\",\"text-disabled\":\"#A8A29E\",\"text-on-cta\":\"#FFFFFF\",\"cta-primary\":\"sage-600\",\"cta-hover\":\"#3D6B5F\",\"border-default\":\"#DDD8CF\",\"border-focus\":\"sage-600\",\"border-error\":\"terracotta-500\",\"error\":\"terracotta-500\",\"success\":\"sage-600\",\"warning\":\"amber-warm\",\"info\":\"sage-600\",\"overlay\":\"rgba(41,37,32,0.45)\",\"surface-secondary\":\"#EDE8DF\",\"surface-input\":\"#FFFDF8\"}},\"fonts\":{\"display\":\"Lora\",\"body\":\"Source Sans 3\"},\"brand\":{\"tone\":\"Warm, grounding, and unhurried. Like a trusted guide on a quiet trail. Natural, honest, and deeply human.\",\"illustrationDirection\":\"Organic shapes inspired by nature — smooth river stones, leaf outlines, and gentle wave forms. Warm earthy tones with sage accents. Hand-crafted feel without being rough.\",\"illustrationDescription\":\"Soft rounded pebble shapes, botanical line work, and breathing circle motifs in warm sand and sage tones. Watercolor-adjacent but clean enough for UI contexts.\",\"motionFeel\":\"bouncy\"},\"elevation\":{\"levels\":[{\"level\":0,\"shadow\":\"none\",\"description\":\"Flat — warm sand background, chip resting state\"},{\"level\":1,\"shadow\":\"0 1px 4px rgba(41,37,32,0.07), 0 0 0 1px rgba(41,37,32,0.04)\",\"description\":\"Cards and session tiles with warm subtle shadow\"},{\"level\":2,\"shadow\":\"0 4px 14px rgba(41,37,32,0.10)\",\"description\":\"Dropdowns, popovers, interactive cards on hover\"},{\"level\":3,\"shadow\":\"0 10px 32px rgba(41,37,32,0.15)\",\"description\":\"Modals and dialogs with warm depth\"}]},\"extras\":\"{\\\"typography_scale\\\":[{\\\"role\\\":\\\"heading-1\\\",\\\"size\\\":\\\"24px\\\",\\\"weight\\\":\\\"700\\\",\\\"family\\\":\\\"Lora\\\",\\\"line_height\\\":\\\"1.3\\\"},{\\\"role\\\":\\\"heading-2\\\",\\\"size\\\":\\\"16px\\\",\\\"weight\\\":\\\"600\\\",\\\"family\\\":\\\"Source Sans 3\\\",\\\"line_height\\\":\\\"1.4\\\"},{\\\"role\\\":\\\"heading-3\\\",\\\"size\\\":\\\"15px\\\",\\\"weight\\\":\\\"600\\\",\\\"family\\\":\\\"Source Sans 3\\\",\\\"line_height\\\":\\\"1.4\\\"},{\\\"role\\\":\\\"body\\\",\\\"size\\\":\\\"14px\\\",\\\"weight\\\":\\\"400\\\",\\\"family\\\":\\\"Source Sans 3\\\",\\\"line_height\\\":\\\"1.6\\\"},{\\\"role\\\":\\\"label\\\",\\\"size\\\":\\\"12px\\\",\\\"weight\\\":\\\"500\\\",\\\"family\\\":\\\"Source Sans 3\\\",\\\"line_height\\\":\\\"1.4\\\"},{\\\"role\\\":\\\"small\\\",\\\"size\\\":\\\"64px\\\",\\\"weight\\\":\\\"300\\\",\\\"family\\\":\\\"Lora\\\",\\\"line_height\\\":\\\"1\\\"}],\\\"borders\\\":{\\\"radius\\\":{\\\"small\\\":6,\\\"medium\\\":12,\\\"large\\\":20,\\\"pill\\\":9999}},\\\"motion\\\":{\\\"durations\\\":{\\\"fast\\\":\\\"160ms\\\",\\\"normal\\\":\\\"280ms\\\",\\\"slow\\\":\\\"380ms\\\"},\\\"easings\\\":{\\\"default\\\":\\\"cubic-bezier(0.4,0,0.2,1)\\\",\\\"emphasized\\\":\\\"cubic-bezier(0.34,1.4,0.64,1)\\\"}},\\\"preview\\\":{\\\"metrics\\\":[{\\\"label\\\":\\\"🔥 Streak\\\",\\\"value\\\":\\\"12 days\\\",\\\"trend\\\":\\\"+1 today\\\"},{\\\"label\\\":\\\"⏱ This Week\\\",\\\"value\\\":\\\"4.2 hrs\\\",\\\"trend\\\":\\\"+0.8 hrs\\\"},{\\\"label\\\":\\\"🧘 Sessions\\\",\\\"value\\\":\\\"38\\\",\\\"trend\\\":\\\"+3 this week\\\"}],\\\"table_rows\\\":[{\\\"name\\\":\\\"Deep Work\\\",\\\"status\\\":\\\"Completed\\\",\\\"amount\\\":\\\"25 min\\\",\\\"date\\\":\\\"Today, 9:00 AM\\\"},{\\\"name\\\":\\\"Meditation\\\",\\\"status\\\":\\\"Completed\\\",\\\"amount\\\":\\\"15 min\\\",\\\"date\\\":\\\"Yesterday, 8:30 AM\\\"},{\\\"name\\\":\\\"Power Nap\\\",\\\"status\\\":\\\"Ended Early\\\",\\\"amount\\\":\\\"5 min\\\",\\\"date\\\":\\\"Mar 26, 2:00 PM\\\"},{\\\"name\\\":\\\"Deep Work\\\",\\\"status\\\":\\\"Completed\\\",\\\"amount\\\":\\\"45 min\\\",\\\"date\\\":\\\"Mar 25, 10:00 AM\\\"}],\\\"nav_items\\\":[\\\"Session\\\",\\\"Timer\\\",\\\"Summary\\\",\\\"Settings\\\"]}}\"}]}",
        toolCalls: [

        ],
        usage: {
            inputTokens: 8149,
            outputTokens: 4050,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,

        },
        cost: {
            inputCostUsd: 0.024447,
            outputCostUsd: 0.06075,
            totalCostUsd: 0.085197,
            model: "claude-sonnet-4-6",
            timestamp: "2026-03-29T07:22:38.779Z",

        },
        model: "claude-sonnet-4-6",
        latencyMs: 69632,
        finishReason: "stop",
        structured: {
            options: [
                {
                    label: "Serene Light",
                    vibe: "Clean, airy, and minimal — like a morning meditation space with soft natural light. Calm indigo accents against crisp whites and cool grays.",
                    colors: {
                        primitive: [
                            {
                                name: "indigo-600",
                                hex: "#4F46E5",

                            },
                            {
                                name: "indigo-100",
                                hex: "#E0E7FF",

                            },
                            {
                                name: "indigo-50",
                                hex: "#EEF2FF",

                            },
                            {
                                name: "slate-900",
                                hex: "#0F172A",

                            },
                            {
                                name: "slate-500",
                                hex: "#64748B",

                            },
                            {
                                name: "slate-100",
                                hex: "#F1F5F9",

                            },
                            {
                                name: "emerald-500",
                                hex: "#10B981",

                            },
                            {
                                name: "rose-500",
                                hex: "#F43F5E",

                            },
                            {
                                name: "amber-500",
                                hex: "#F59E0B",

                            },

                        ],
                        semantic: {
                            "background-primary": "slate-100",
                            "surface-primary": "#FFFFFF",
                            "surface-elevated": "#FFFFFF",
                            "text-primary": "slate-900",
                            "text-secondary": "slate-500",
                            "text-disabled": "#94A3B8",
                            "text-on-cta": "#FFFFFF",
                            "cta-primary": "indigo-600",
                            "cta-hover": "#4338CA",
                            "border-default": "#E2E8F0",
                            "border-focus": "indigo-600",
                            "border-error": "rose-500",
                            error: "rose-500",
                            success: "emerald-500",
                            warning: "amber-500",
                            info: "indigo-600",
                            overlay: "rgba(15,23,42,0.4)",
                            "surface-secondary": "#F8FAFC",
                            "surface-input": "#FFFFFF",

                        },

                    },
                    fonts: {
                        display: "Inter",
                        body: "Inter",

                    },
                    brand: {
                        tone: "Calm, focused, and welcoming. Quiet confidence without sterility. Every word earns its place.",
                        illustrationDirection: "Minimal line illustrations — thin strokes, generous whitespace, soft indigo and slate tones. No gradients. Iconography is outlined and purposeful.",
                        illustrationDescription: "Simple circular motifs and breathing wave forms rendered in single-weight lines. Soft indigo on white backgrounds. Think Headspace meets Linear.",
                        motionFeel: "smooth",

                    },
                    elevation: {
                        levels: [
                            {
                                level: 0,
                                shadow: "none",
                                description: "Flat — page background, inactive chips",

                            },
                            {
                                level: 1,
                                shadow: "0 1px 3px rgba(0,0,0,0.08)",
                                description: "Cards, session type tiles, stat cards",

                            },
                            {
                                level: 2,
                                shadow: "0 4px 12px rgba(0,0,0,0.10)",
                                description: "Dropdowns, popovers, selected cards elevated",

                            },
                            {
                                level: 3,
                                shadow: "0 8px 24px rgba(0,0,0,0.12)",
                                description: "Modals, settings dialog, overlay surfaces",

                            },

                        ],

                    },
                    extras: "{\"typography_scale\":[{\"role\":\"heading-1\",\"size\":\"24px\",\"weight\":\"700\",\"family\":\"Inter\",\"line_height\":\"1.3\"},{\"role\":\"heading-2\",\"size\":\"16px\",\"weight\":\"600\",\"family\":\"Inter\",\"line_height\":\"1.4\"},{\"role\":\"heading-3\",\"size\":\"15px\",\"weight\":\"600\",\"family\":\"Inter\",\"line_height\":\"1.4\"},{\"role\":\"body\",\"size\":\"14px\",\"weight\":\"400\",\"family\":\"Inter\",\"line_height\":\"1.5\"},{\"role\":\"label\",\"size\":\"12px\",\"weight\":\"500\",\"family\":\"Inter\",\"line_height\":\"1.4\"},{\"role\":\"small\",\"size\":\"64px\",\"weight\":\"300\",\"family\":\"Inter\",\"line_height\":\"1\"}],\"borders\":{\"radius\":{\"small\":8,\"medium\":12,\"large\":16,\"pill\":9999}},\"motion\":{\"durations\":{\"fast\":\"150ms\",\"normal\":\"250ms\",\"slow\":\"350ms\"},\"easings\":{\"default\":\"ease-in-out\",\"emphasized\":\"cubic-bezier(0.34,1.56,0.64,1)\"}},\"preview\":{\"metrics\":[{\"label\":\"🔥 Streak\",\"value\":\"12 days\",\"trend\":\"+1 today\"},{\"label\":\"⏱ This Week\",\"value\":\"4.2 hrs\",\"trend\":\"+0.8 hrs\"},{\"label\":\"🧘 Sessions\",\"value\":\"38\",\"trend\":\"+3 this week\"}],\"table_rows\":[{\"name\":\"Deep Work\",\"status\":\"Completed\",\"amount\":\"25 min\",\"date\":\"Today, 9:00 AM\"},{\"name\":\"Meditation\",\"status\":\"Completed\",\"amount\":\"15 min\",\"date\":\"Yesterday, 8:30 AM\"},{\"name\":\"Power Nap\",\"status\":\"Ended Early\",\"amount\":\"5 min\",\"date\":\"Mar 26, 2:00 PM\"},{\"name\":\"Deep Work\",\"status\":\"Completed\",\"amount\":\"45 min\",\"date\":\"Mar 25, 10:00 AM\"}],\"nav_items\":[\"Session\",\"Timer\",\"Summary\",\"Settings\"]}}",

                },
                {
                    label: "Midnight Depth",
                    vibe: "Deep, immersive dark mode — like a candlelit study at midnight. Rich navy surfaces with luminous indigo glows and warm accent highlights.",
                    colors: {
                        primitive: [
                            {
                                name: "navy-950",
                                hex: "#0A0F1E",

                            },
                            {
                                name: "navy-800",
                                hex: "#131C35",

                            },
                            {
                                name: "navy-700",
                                hex: "#1A2545",

                            },
                            {
                                name: "indigo-400",
                                hex: "#818CF8",

                            },
                            {
                                name: "indigo-300",
                                hex: "#A5B4FC",

                            },
                            {
                                name: "slate-300",
                                hex: "#CBD5E1",

                            },
                            {
                                name: "slate-500",
                                hex: "#64748B",

                            },
                            {
                                name: "emerald-400",
                                hex: "#34D399",

                            },
                            {
                                name: "amber-400",
                                hex: "#FBBF24",

                            },
                            {
                                name: "rose-400",
                                hex: "#FB7185",

                            },

                        ],
                        semantic: {
                            "background-primary": "navy-950",
                            "surface-primary": "navy-800",
                            "surface-elevated": "navy-700",
                            "text-primary": "slate-300",
                            "text-secondary": "slate-500",
                            "text-disabled": "#334155",
                            "text-on-cta": "#0A0F1E",
                            "cta-primary": "indigo-400",
                            "cta-hover": "indigo-300",
                            "border-default": "#1E2D50",
                            "border-focus": "indigo-400",
                            "border-error": "rose-400",
                            error: "rose-400",
                            success: "emerald-400",
                            warning: "amber-400",
                            info: "indigo-300",
                            overlay: "rgba(0,0,0,0.65)",
                            "surface-secondary": "#0E1528",
                            "surface-input": "navy-700",

                        },

                    },
                    fonts: {
                        display: "DM Sans",
                        body: "DM Sans",

                    },
                    brand: {
                        tone: "Focused and introspective. A quiet sanctuary from the noise. Premium, unhurried, and deeply intentional.",
                        illustrationDirection: "Glowing circular orbs and soft radial gradients on dark backgrounds. Thin luminous lines suggesting breath and energy. Deep indigo to violet hues.",
                        illustrationDescription: "Concentric rings with soft glow effects, like a sonar pulse in deep water. Ambient particles and gradient rings evoke depth and calm focus.",
                        motionFeel: "subtle",

                    },
                    elevation: {
                        levels: [
                            {
                                level: 0,
                                shadow: "none",
                                description: "Flat — page background, inactive elements",

                            },
                            {
                                level: 1,
                                shadow: "0 1px 4px rgba(0,0,0,0.3)",
                                description: "Cards and surface tiles on dark background",

                            },
                            {
                                level: 2,
                                shadow: "0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(129,140,248,0.08)",
                                description: "Dropdowns, popovers with subtle indigo rim",

                            },
                            {
                                level: 3,
                                shadow: "0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(129,140,248,0.12)",
                                description: "Modals with deep shadow and faint glow border",

                            },

                        ],

                    },
                    extras: "{\"typography_scale\":[{\"role\":\"heading-1\",\"size\":\"24px\",\"weight\":\"600\",\"family\":\"DM Sans\",\"line_height\":\"1.3\"},{\"role\":\"heading-2\",\"size\":\"16px\",\"weight\":\"600\",\"family\":\"DM Sans\",\"line_height\":\"1.4\"},{\"role\":\"heading-3\",\"size\":\"15px\",\"weight\":\"500\",\"family\":\"DM Sans\",\"line_height\":\"1.4\"},{\"role\":\"body\",\"size\":\"14px\",\"weight\":\"400\",\"family\":\"DM Sans\",\"line_height\":\"1.6\"},{\"role\":\"label\",\"size\":\"12px\",\"weight\":\"500\",\"family\":\"DM Sans\",\"line_height\":\"1.4\"},{\"role\":\"small\",\"size\":\"64px\",\"weight\":\"300\",\"family\":\"DM Sans\",\"line_height\":\"1\"}],\"borders\":{\"radius\":{\"small\":8,\"medium\":12,\"large\":16,\"pill\":9999}},\"motion\":{\"durations\":{\"fast\":\"150ms\",\"normal\":\"300ms\",\"slow\":\"400ms\"},\"easings\":{\"default\":\"ease-in-out\",\"emphasized\":\"cubic-bezier(0.4,0,0.2,1)\"}},\"preview\":{\"metrics\":[{\"label\":\"🔥 Streak\",\"value\":\"12 days\",\"trend\":\"+1 today\"},{\"label\":\"⏱ This Week\",\"value\":\"4.2 hrs\",\"trend\":\"+0.8 hrs\"},{\"label\":\"🧘 Sessions\",\"value\":\"38\",\"trend\":\"+3 this week\"}],\"table_rows\":[{\"name\":\"Deep Work\",\"status\":\"Completed\",\"amount\":\"25 min\",\"date\":\"Today, 9:00 AM\"},{\"name\":\"Meditation\",\"status\":\"Completed\",\"amount\":\"15 min\",\"date\":\"Yesterday, 8:30 AM\"},{\"name\":\"Power Nap\",\"status\":\"Ended Early\",\"amount\":\"5 min\",\"date\":\"Mar 26, 2:00 PM\"},{\"name\":\"Deep Work\",\"status\":\"Completed\",\"amount\":\"45 min\",\"date\":\"Mar 25, 10:00 AM\"}],\"nav_items\":[\"Session\",\"Timer\",\"Summary\",\"Settings\"]}}",

                },
                {
                    label: "Warm Pebble",
                    vibe: "Organic, warm, and grounding — like a zen garden at golden hour. Sandy neutrals and sage greens with terracotta accents evoke natural calm.",
                    colors: {
                        primitive: [
                            {
                                name: "warm-sand",
                                hex: "#F5F0E8",

                            },
                            {
                                name: "pebble-100",
                                hex: "#EDE8DF",

                            },
                            {
                                name: "stone-800",
                                hex: "#292520",

                            },
                            {
                                name: "stone-500",
                                hex: "#78716C",

                            },
                            {
                                name: "sage-600",
                                hex: "#4A7C6F",

                            },
                            {
                                name: "sage-200",
                                hex: "#C8DDD9",

                            },
                            {
                                name: "terracotta-500",
                                hex: "#C2714F",

                            },
                            {
                                name: "amber-warm",
                                hex: "#D4A843",

                            },

                        ],
                        semantic: {
                            "background-primary": "warm-sand",
                            "surface-primary": "#FFFDF8",
                            "surface-elevated": "#FFFFFF",
                            "text-primary": "stone-800",
                            "text-secondary": "stone-500",
                            "text-disabled": "#A8A29E",
                            "text-on-cta": "#FFFFFF",
                            "cta-primary": "sage-600",
                            "cta-hover": "#3D6B5F",
                            "border-default": "#DDD8CF",
                            "border-focus": "sage-600",
                            "border-error": "terracotta-500",
                            error: "terracotta-500",
                            success: "sage-600",
                            warning: "amber-warm",
                            info: "sage-600",
                            overlay: "rgba(41,37,32,0.45)",
                            "surface-secondary": "#EDE8DF",
                            "surface-input": "#FFFDF8",

                        },

                    },
                    fonts: {
                        display: "Lora",
                        body: "Source Sans 3",

                    },
                    brand: {
                        tone: "Warm, grounding, and unhurried. Like a trusted guide on a quiet trail. Natural, honest, and deeply human.",
                        illustrationDirection: "Organic shapes inspired by nature — smooth river stones, leaf outlines, and gentle wave forms. Warm earthy tones with sage accents. Hand-crafted feel without being rough.",
                        illustrationDescription: "Soft rounded pebble shapes, botanical line work, and breathing circle motifs in warm sand and sage tones. Watercolor-adjacent but clean enough for UI contexts.",
                        motionFeel: "bouncy",

                    },
                    elevation: {
                        levels: [
                            {
                                level: 0,
                                shadow: "none",
                                description: "Flat — warm sand background, chip resting state",

                            },
                            {
                                level: 1,
                                shadow: "0 1px 4px rgba(41,37,32,0.07), 0 0 0 1px rgba(41,37,32,0.04)",
                                description: "Cards and session tiles with warm subtle shadow",

                            },
                            {
                                level: 2,
                                shadow: "0 4px 14px rgba(41,37,32,0.10)",
                                description: "Dropdowns, popovers, interactive cards on hover",

                            },
                            {
                                level: 3,
                                shadow: "0 10px 32px rgba(41,37,32,0.15)",
                                description: "Modals and dialogs with warm depth",

                            },

                        ],

                    },
                    extras: "{\"typography_scale\":[{\"role\":\"heading-1\",\"size\":\"24px\",\"weight\":\"700\",\"family\":\"Lora\",\"line_height\":\"1.3\"},{\"role\":\"heading-2\",\"size\":\"16px\",\"weight\":\"600\",\"family\":\"Source Sans 3\",\"line_height\":\"1.4\"},{\"role\":\"heading-3\",\"size\":\"15px\",\"weight\":\"600\",\"family\":\"Source Sans 3\",\"line_height\":\"1.4\"},{\"role\":\"body\",\"size\":\"14px\",\"weight\":\"400\",\"family\":\"Source Sans 3\",\"line_height\":\"1.6\"},{\"role\":\"label\",\"size\":\"12px\",\"weight\":\"500\",\"family\":\"Source Sans 3\",\"line_height\":\"1.4\"},{\"role\":\"small\",\"size\":\"64px\",\"weight\":\"300\",\"family\":\"Lora\",\"line_height\":\"1\"}],\"borders\":{\"radius\":{\"small\":6,\"medium\":12,\"large\":20,\"pill\":9999}},\"motion\":{\"durations\":{\"fast\":\"160ms\",\"normal\":\"280ms\",\"slow\":\"380ms\"},\"easings\":{\"default\":\"cubic-bezier(0.4,0,0.2,1)\",\"emphasized\":\"cubic-bezier(0.34,1.4,0.64,1)\"}},\"preview\":{\"metrics\":[{\"label\":\"🔥 Streak\",\"value\":\"12 days\",\"trend\":\"+1 today\"},{\"label\":\"⏱ This Week\",\"value\":\"4.2 hrs\",\"trend\":\"+0.8 hrs\"},{\"label\":\"🧘 Sessions\",\"value\":\"38\",\"trend\":\"+3 this week\"}],\"table_rows\":[{\"name\":\"Deep Work\",\"status\":\"Completed\",\"amount\":\"25 min\",\"date\":\"Today, 9:00 AM\"},{\"name\":\"Meditation\",\"status\":\"Completed\",\"amount\":\"15 min\",\"date\":\"Yesterday, 8:30 AM\"},{\"name\":\"Power Nap\",\"status\":\"Ended Early\",\"amount\":\"5 min\",\"date\":\"Mar 26, 2:00 PM\"},{\"name\":\"Deep Work\",\"status\":\"Completed\",\"amount\":\"45 min\",\"date\":\"Mar 25, 10:00 AM\"}],\"nav_items\":[\"Session\",\"Timer\",\"Summary\",\"Settings\"]}}",

                },

            ],

        },

    },

}

// const val = {
//     ok: true,
//     value: {
//         content: "{\"options\":[{\"label\":\"Serene Light\",\"vibe\":\"Clean, airy, and minimal — a calm productivity sanctuary with soft whites and gentle indigo accents that never overwhelm.\",\"colors\":{\"primitive\":[{\"name\":\"deep-indigo\",\"hex\":\"#4F46E5\"},{\"name\":\"light-indigo\",\"hex\":\"#E0E7FF\"},{\"name\":\"pale-indigo\",\"hex\":\"#EEF2FF\"},{\"name\":\"slate-dark\",\"hex\":\"#0F172A\"},{\"name\":\"slate-mid\",\"hex\":\"#64748B\"},{\"name\":\"slate-light\",\"hex\":\"#F1F5F9\"},{\"name\":\"emerald\",\"hex\":\"#10B981\"},{\"name\":\"pure-white\",\"hex\":\"#FFFFFF\"}],\"semantic\":{\"background-primary\":\"slate-light\",\"surface-primary\":\"pure-white\",\"surface-elevated\":\"pure-white\",\"text-primary\":\"slate-dark\",\"text-secondary\":\"slate-mid\",\"text-disabled\":\"slate-mid\",\"text-on-cta\":\"pure-white\",\"cta-primary\":\"deep-indigo\",\"cta-hover\":\"#4338CA\",\"border-default\":\"#E2E8F0\",\"border-focus\":\"deep-indigo\",\"border-error\":\"#F43F5E\",\"error\":\"#F43F5E\",\"success\":\"emerald\",\"warning\":\"#F59E0B\",\"info\":\"deep-indigo\",\"overlay\":\"rgba(15,23,42,0.45)\",\"surface-secondary\":\"slate-light\",\"surface-input\":\"pure-white\"}},\"fonts\":{\"display\":\"Inter\",\"body\":\"Inter\"},\"brand\":{\"tone\":\"Calm, focused, and trustworthy. Clear hierarchy with generous whitespace that invites stillness. Language is warm but efficient.\",\"illustrationDirection\":\"Minimal line art with soft indigo and slate tones. Simple geometric forms — circles, arcs, breath curves. No clutter.\",\"illustrationDescription\":\"Thin-stroke circular motifs echoing the timer ring. Gentle gradient fills from pale-indigo to white. Sparse negative space as a design element.\",\"motionFeel\":\"smooth\"},\"elevation\":{\"levels\":[{\"level\":0,\"shadow\":\"none\",\"description\":\"Flat — page background, no elevation\"},{\"level\":1,\"shadow\":\"0 1px 3px rgba(0,0,0,0.08)\",\"description\":\"Cards — session type cards, stat cards\"},{\"level\":2,\"shadow\":\"0 4px 12px rgba(0,0,0,0.10)\",\"description\":\"Dropdowns — custom duration reveal, popovers\"},{\"level\":3,\"shadow\":\"0 8px 24px rgba(0,0,0,0.12)\",\"description\":\"Modals — settings dialog, elevated overlays\"}]}},{\"label\":\"Midnight Focus\",\"vibe\":\"Dark, immersive, and deeply focused — a night-mode sanctuary that feels like entering a flow state the moment you open it.\",\"colors\":{\"primitive\":[{\"name\":\"void-black\",\"hex\":\"#0A0F1E\"},{\"name\":\"deep-navy\",\"hex\":\"#111827\"},{\"name\":\"surface-navy\",\"hex\":\"#1C2333\"},{\"name\":\"muted-navy\",\"hex\":\"#253047\"},{\"name\":\"soft-indigo\",\"hex\":\"#818CF8\"},{\"name\":\"pale-indigo\",\"hex\":\"#312E81\"},{\"name\":\"moon-white\",\"hex\":\"#E2E8F0\"},{\"name\":\"ghost-white\",\"hex\":\"#94A3B8\"}],\"semantic\":{\"background-primary\":\"void-black\",\"surface-primary\":\"deep-navy\",\"surface-elevated\":\"surface-navy\",\"text-primary\":\"moon-white\",\"text-secondary\":\"ghost-white\",\"text-disabled\":\"#475569\",\"text-on-cta\":\"moon-white\",\"cta-primary\":\"soft-indigo\",\"cta-hover\":\"#6366F1\",\"border-default\":\"muted-navy\",\"border-focus\":\"soft-indigo\",\"border-error\":\"#FB7185\",\"error\":\"#FB7185\",\"success\":\"#34D399\",\"warning\":\"#FCD34D\",\"info\":\"soft-indigo\",\"overlay\":\"rgba(0,0,0,0.65)\",\"surface-secondary\":\"surface-navy\",\"surface-input\":\"muted-navy\"}},\"fonts\":{\"display\":\"Space Grotesk\",\"body\":\"Inter\"},\"brand\":{\"tone\":\"Focused, introspective, and powerful. Minimal words, maximum presence. The interface recedes so the mind can expand.\",\"illustrationDirection\":\"Deep space aesthetic — dark backgrounds with glowing indigo and violet accents. Subtle particle or starfield textures. Circular glows around the timer ring.\",\"illustrationDescription\":\"Soft luminous rings on dark canvas, thin neon-indigo strokes, gentle radial gradients emanating from center. Feels like bioluminescence or distant stars.\",\"motionFeel\":\"subtle\"},\"elevation\":{\"levels\":[{\"level\":0,\"shadow\":\"none\",\"description\":\"Flat — void background, base layer\"},{\"level\":1,\"shadow\":\"0 1px 4px rgba(0,0,0,0.4)\",\"description\":\"Cards — session cards with dark lift\"},{\"level\":2,\"shadow\":\"0 4px 16px rgba(0,0,0,0.5)\",\"description\":\"Dropdowns — popovers floating on dark surface\"},{\"level\":3,\"shadow\":\"0 12px 40px rgba(0,0,0,0.65)\",\"description\":\"Modals — settings dialog with deep dark shadow\"}]}},{\"label\":\"Warm Zen\",\"vibe\":\"Earthy, organic, and human — warm sand tones with terracotta accents that feel like a meditation retreat rather than a productivity app.\",\"colors\":{\"primitive\":[{\"name\":\"warm-sand\",\"hex\":\"#F5F0E8\"},{\"name\":\"soft-cream\",\"hex\":\"#FDFAF5\"},{\"name\":\"muted-cream\",\"hex\":\"#EDE8DE\"},{\"name\":\"terracotta\",\"hex\":\"#C4622D\"},{\"name\":\"terracotta-light\",\"hex\":\"#F3DDD1\"},{\"name\":\"charcoal\",\"hex\":\"#2C2416\"},{\"name\":\"warm-stone\",\"hex\":\"#7C6F5B\"},{\"name\":\"sage\",\"hex\":\"#5A7A5F\"}],\"semantic\":{\"background-primary\":\"warm-sand\",\"surface-primary\":\"soft-cream\",\"surface-elevated\":\"soft-cream\",\"text-primary\":\"charcoal\",\"text-secondary\":\"warm-stone\",\"text-disabled\":\"#B0A594\",\"text-on-cta\":\"soft-cream\",\"cta-primary\":\"terracotta\",\"cta-hover\":\"#A8501F\",\"border-default\":\"muted-cream\",\"border-focus\":\"terracotta\",\"border-error\":\"#C0392B\",\"error\":\"#C0392B\",\"success\":\"sage\",\"warning\":\"#D4882A\",\"info\":\"terracotta\",\"overlay\":\"rgba(44,36,22,0.45)\",\"surface-secondary\":\"muted-cream\",\"surface-input\":\"soft-cream\"}},\"fonts\":{\"display\":\"Playfair Display\",\"body\":\"Source Sans 3\"},\"brand\":{\"tone\":\"Grounded, nurturing, and unhurried. Speaks like a wise friend — never clinical. Encourages without pressure. Celebrates small moments.\",\"illustrationDirection\":\"Organic, hand-crafted aesthetic. Warm watercolor washes, botanical line art, gentle brushstroke textures. Earthy palette with occasional sage green accents.\",\"illustrationDescription\":\"Loose ink-brush circles for the timer ring. Subtle paper texture overlays. Leaf or stone motifs as ambient decoration. Feels handmade and intentional.\",\"motionFeel\":\"bouncy\"},\"elevation\":{\"levels\":[{\"level\":0,\"shadow\":\"none\",\"description\":\"Flat — warm sand background, grounded base\"},{\"level\":1,\"shadow\":\"0 1px 4px rgba(44,36,22,0.07)\",\"description\":\"Cards — session cards with warm lift\"},{\"level\":2,\"shadow\":\"0 4px 14px rgba(44,36,22,0.10)\",\"description\":\"Dropdowns — popovers with warm depth\"},{\"level\":3,\"shadow\":\"0 10px 32px rgba(44,36,22,0.14)\",\"description\":\"Modals — settings dialog with earthy shadow\"}]}}]}",
//         toolCalls: [
//         ],
//         usage: {
//             inputTokens: 7673,
//             outputTokens: 1906,
//             cacheReadTokens: 0,
//             cacheWriteTokens: 0,
//         },
//         cost: {
//             inputCostUsd: 0.023019,
//             outputCostUsd: 0.028589999999999997,
//             totalCostUsd: 0.051609,
//             model: "claude-sonnet-4-6",
//             timestamp: "2026-03-29T05:11:38.958Z",
//         },
//         model: "claude-sonnet-4-6",
//         latencyMs: 33767,
//         finishReason: "stop",
//         structured: {
//             options: [
//                 {
//                     label: "Serene Light",
//                     vibe: "Clean, airy, and minimal — a calm productivity sanctuary with soft whites and gentle indigo accents that never overwhelm.",
//                     colors: {
//                         primitive: [
//                             {
//                                 name: "deep-indigo",
//                                 hex: "#4F46E5",
//                             },
//                             {
//                                 name: "light-indigo",
//                                 hex: "#E0E7FF",
//                             },
//                             {
//                                 name: "pale-indigo",
//                                 hex: "#EEF2FF",
//                             },
//                             {
//                                 name: "slate-dark",
//                                 hex: "#0F172A",
//                             },
//                             {
//                                 name: "slate-mid",
//                                 hex: "#64748B",
//                             },
//                             {
//                                 name: "slate-light",
//                                 hex: "#F1F5F9",
//                             },
//                             {
//                                 name: "emerald",
//                                 hex: "#10B981",
//                             },
//                             {
//                                 name: "pure-white",
//                                 hex: "#FFFFFF",
//                             },
//                         ],
//                         semantic: {
//                             "background-primary": "slate-light",
//                             "surface-primary": "pure-white",
//                             "surface-elevated": "pure-white",
//                             "text-primary": "slate-dark",
//                             "text-secondary": "slate-mid",
//                             "text-disabled": "slate-mid",
//                             "text-on-cta": "pure-white",
//                             "cta-primary": "deep-indigo",
//                             "cta-hover": "#4338CA",
//                             "border-default": "#E2E8F0",
//                             "border-focus": "deep-indigo",
//                             "border-error": "#F43F5E",
//                             error: "#F43F5E",
//                             success: "emerald",
//                             warning: "#F59E0B",
//                             info: "deep-indigo",
//                             overlay: "rgba(15,23,42,0.45)",
//                             "surface-secondary": "slate-light",
//                             "surface-input": "pure-white",
//                         },
//                     },
//                     fonts: {
//                         display: "Inter",
//                         body: "Inter",
//                     },
//                     brand: {
//                         tone: "Calm, focused, and trustworthy. Clear hierarchy with generous whitespace that invites stillness. Language is warm but efficient.",
//                         illustrationDirection: "Minimal line art with soft indigo and slate tones. Simple geometric forms — circles, arcs, breath curves. No clutter.",
//                         illustrationDescription: "Thin-stroke circular motifs echoing the timer ring. Gentle gradient fills from pale-indigo to white. Sparse negative space as a design element.",
//                         motionFeel: "smooth",
//                     },
//                     elevation: {
//                         levels: [
//                             {
//                                 level: 0,
//                                 shadow: "none",
//                                 description: "Flat — page background, no elevation",
//                             },
//                             {
//                                 level: 1,
//                                 shadow: "0 1px 3px rgba(0,0,0,0.08)",
//                                 description: "Cards — session type cards, stat cards",
//                             },
//                             {
//                                 level: 2,
//                                 shadow: "0 4px 12px rgba(0,0,0,0.10)",
//                                 description: "Dropdowns — custom duration reveal, popovers",
//                             },
//                             {
//                                 level: 3,
//                                 shadow: "0 8px 24px rgba(0,0,0,0.12)",
//                                 description: "Modals — settings dialog, elevated overlays",
//                             },
//                         ],
//                     },
//                 },
//                 {
//                     label: "Midnight Focus",
//                     vibe: "Dark, immersive, and deeply focused — a night-mode sanctuary that feels like entering a flow state the moment you open it.",
//                     colors: {
//                         primitive: [
//                             {
//                                 name: "void-black",
//                                 hex: "#0A0F1E",
//                             },
//                             {
//                                 name: "deep-navy",
//                                 hex: "#111827",
//                             },
//                             {
//                                 name: "surface-navy",
//                                 hex: "#1C2333",
//                             },
//                             {
//                                 name: "muted-navy",
//                                 hex: "#253047",
//                             },
//                             {
//                                 name: "soft-indigo",
//                                 hex: "#818CF8",
//                             },
//                             {
//                                 name: "pale-indigo",
//                                 hex: "#312E81",
//                             },
//                             {
//                                 name: "moon-white",
//                                 hex: "#E2E8F0",
//                             },
//                             {
//                                 name: "ghost-white",
//                                 hex: "#94A3B8",
//                             },
//                         ],
//                         semantic: {
//                             "background-primary": "void-black",
//                             "surface-primary": "deep-navy",
//                             "surface-elevated": "surface-navy",
//                             "text-primary": "moon-white",
//                             "text-secondary": "ghost-white",
//                             "text-disabled": "#475569",
//                             "text-on-cta": "moon-white",
//                             "cta-primary": "soft-indigo",
//                             "cta-hover": "#6366F1",
//                             "border-default": "muted-navy",
//                             "border-focus": "soft-indigo",
//                             "border-error": "#FB7185",
//                             error: "#FB7185",
//                             success: "#34D399",
//                             warning: "#FCD34D",
//                             info: "soft-indigo",
//                             overlay: "rgba(0,0,0,0.65)",
//                             "surface-secondary": "surface-navy",
//                             "surface-input": "muted-navy",
//                         },
//                     },
//                     fonts: {
//                         display: "Space Grotesk",
//                         body: "Inter",
//                     },
//                     brand: {
//                         tone: "Focused, introspective, and powerful. Minimal words, maximum presence. The interface recedes so the mind can expand.",
//                         illustrationDirection: "Deep space aesthetic — dark backgrounds with glowing indigo and violet accents. Subtle particle or starfield textures. Circular glows around the timer ring.",
//                         illustrationDescription: "Soft luminous rings on dark canvas, thin neon-indigo strokes, gentle radial gradients emanating from center. Feels like bioluminescence or distant stars.",
//                         motionFeel: "subtle",
//                     },
//                     elevation: {
//                         levels: [
//                             {
//                                 level: 0,
//                                 shadow: "none",
//                                 description: "Flat — void background, base layer",
//                             },
//                             {
//                                 level: 1,
//                                 shadow: "0 1px 4px rgba(0,0,0,0.4)",
//                                 description: "Cards — session cards with dark lift",
//                             },
//                             {
//                                 level: 2,
//                                 shadow: "0 4px 16px rgba(0,0,0,0.5)",
//                                 description: "Dropdowns — popovers floating on dark surface",
//                             },
//                             {
//                                 level: 3,
//                                 shadow: "0 12px 40px rgba(0,0,0,0.65)",
//                                 description: "Modals — settings dialog with deep dark shadow",
//                             },
//                         ],
//                     },
//                 },
//                 {
//                     label: "Warm Zen",
//                     vibe: "Earthy, organic, and human — warm sand tones with terracotta accents that feel like a meditation retreat rather than a productivity app.",
//                     colors: {
//                         primitive: [
//                             {
//                                 name: "warm-sand",
//                                 hex: "#F5F0E8",
//                             },
//                             {
//                                 name: "soft-cream",
//                                 hex: "#FDFAF5",
//                             },
//                             {
//                                 name: "muted-cream",
//                                 hex: "#EDE8DE",
//                             },
//                             {
//                                 name: "terracotta",
//                                 hex: "#C4622D",
//                             },
//                             {
//                                 name: "terracotta-light",
//                                 hex: "#F3DDD1",
//                             },
//                             {
//                                 name: "charcoal",
//                                 hex: "#2C2416",
//                             },
//                             {
//                                 name: "warm-stone",
//                                 hex: "#7C6F5B",
//                             },
//                             {
//                                 name: "sage",
//                                 hex: "#5A7A5F",
//                             },
//                         ],
//                         semantic: {
//                             "background-primary": "warm-sand",
//                             "surface-primary": "soft-cream",
//                             "surface-elevated": "soft-cream",
//                             "text-primary": "charcoal",
//                             "text-secondary": "warm-stone",
//                             "text-disabled": "#B0A594",
//                             "text-on-cta": "soft-cream",
//                             "cta-primary": "terracotta",
//                             "cta-hover": "#A8501F",
//                             "border-default": "muted-cream",
//                             "border-focus": "terracotta",
//                             "border-error": "#C0392B",
//                             error: "#C0392B",
//                             success: "sage",
//                             warning: "#D4882A",
//                             info: "terracotta",
//                             overlay: "rgba(44,36,22,0.45)",
//                             "surface-secondary": "muted-cream",
//                             "surface-input": "soft-cream",
//                         },
//                     },
//                     fonts: {
//                         display: "Playfair Display",
//                         body: "Source Sans 3",
//                     },
//                     brand: {
//                         tone: "Grounded, nurturing, and unhurried. Speaks like a wise friend — never clinical. Encourages without pressure. Celebrates small moments.",
//                         illustrationDirection: "Organic, hand-crafted aesthetic. Warm watercolor washes, botanical line art, gentle brushstroke textures. Earthy palette with occasional sage green accents.",
//                         illustrationDescription: "Loose ink-brush circles for the timer ring. Subtle paper texture overlays. Leaf or stone motifs as ambient decoration. Feels handmade and intentional.",
//                         motionFeel: "bouncy",
//                     },
//                     elevation: {
//                         levels: [
//                             {
//                                 level: 0,
//                                 shadow: "none",
//                                 description: "Flat — warm sand background, grounded base",
//                             },
//                             {
//                                 level: 1,
//                                 shadow: "0 1px 4px rgba(44,36,22,0.07)",
//                                 description: "Cards — session cards with warm lift",
//                             },
//                             {
//                                 level: 2,
//                                 shadow: "0 4px 14px rgba(44,36,22,0.10)",
//                                 description: "Dropdowns — popovers with warm depth",
//                             },
//                             {
//                                 level: 3,
//                                 shadow: "0 10px 32px rgba(44,36,22,0.14)",
//                                 description: "Modals — settings dialog with earthy shadow",
//                             },
//                         ],
//                     },
//                 },
//             ],
//         },
//     },
// }


/** Recorded `CompletionResult` shape (inner payload only — outer `Ok` is applied below). */
const mockCompletionResult = val.value as CompletionResult;

/** Fixture matching `provider.complete` for local debugging. */
export function generateDesignOptionsMock(prompt: Prompt, opts: CompletionOptions): Promise<Result<CompletionResult, ProviderError>> {
    return Promise.resolve(Ok(mockCompletionResult));
}