const dsCtxMock = {
    designSystemPrompt: "# Design System — Calm, focused, and welcoming. Quiet confidence without sterility. Every word earns its place.\nAudience: general\nWCAG: AA\n\n## Colors\n- indigo-600: `{ r: 0.31, g: 0.27, b: 0.90 }`\n- indigo-100: `{ r: 0.88, g: 0.91, b: 1.00 }`\n- indigo-50: `{ r: 0.93, g: 0.95, b: 1.00 }`\n- slate-900: `{ r: 0.06, g: 0.09, b: 0.16 }`\n- slate-500: `{ r: 0.39, g: 0.45, b: 0.55 }`\n- slate-100: `{ r: 0.95, g: 0.96, b: 0.98 }`\n- emerald-500: `{ r: 0.06, g: 0.73, b: 0.51 }`\n- rose-500: `{ r: 0.96, g: 0.25, b: 0.37 }`\n- amber-500: `{ r: 0.96, g: 0.62, b: 0.04 }`\n\n## Semantic Roles\n(Maps semantic names used in component tokens to actual color values)\n- background-primary -> slate-100 (#F1F5F9)\n- surface-primary -> #FFFFFF\n- surface-elevated -> #FFFFFF\n- text-primary -> slate-900 (#0F172A)\n- text-secondary -> slate-500 (#64748B)\n- text-disabled -> #94A3B8\n- text-on-cta -> #FFFFFF\n- cta-primary -> indigo-600 (#4F46E5)\n- cta-hover -> #4338CA\n- border-default -> #E2E8F0\n- border-focus -> indigo-600 (#4F46E5)\n- border-error -> rose-500 (#F43F5E)\n- error -> rose-500 (#F43F5E)\n- success -> emerald-500 (#10B981)\n- warning -> amber-500 (#F59E0B)\n- info -> indigo-600 (#4F46E5)\n- overlay -> rgba(15,23,42,0.4)\n- surface-secondary -> #F8FAFC\n- surface-input -> #FFFFFF\n\n## Typography\n- heading-1: 24px/1.3, weight 700 (display)\n- heading-2: 16px/1.4, weight 600 (display)\n- heading-3: 15px/1.4, weight 600 (display)\n- body: 14px/1.5, weight 400 (display)\n- label: 12px/1.4, weight 500 (display)\n- small: 64px/1, weight 300 (display)\n\n## Spacing\nUnit: 8px | Scale: 4, 8, 12, 16, 24, 32, 48, 64",
    colorPalette: [
        {
            name: "indigo-600",
            rgb: {
                r: 0.30980392156862746,
                g: 0.27450980392156865,
                b: 0.8980392156862745,
            },
            usage: "indigo-600",
            family: "custom",
            shade: "",
        },
        {
            name: "indigo-100",
            rgb: {
                r: 0.8784313725490196,
                g: 0.9058823529411765,
                b: 1,
            },
            usage: "indigo-100",
            family: "custom",
            shade: "",
        },
        {
            name: "indigo-50",
            rgb: {
                r: 0.9333333333333333,
                g: 0.9490196078431372,
                b: 1,
            },
            usage: "indigo-50",
            family: "custom",
            shade: "",
        },
        {
            name: "slate-900",
            rgb: {
                r: 0.058823529411764705,
                g: 0.09019607843137255,
                b: 0.16470588235294117,
            },
            usage: "slate-900",
            family: "custom",
            shade: "",
        },
        {
            name: "slate-500",
            rgb: {
                r: 0.39215686274509803,
                g: 0.4549019607843137,
                b: 0.5450980392156862,
            },
            usage: "slate-500",
            family: "custom",
            shade: "",
        },
        {
            name: "slate-100",
            rgb: {
                r: 0.9450980392156862,
                g: 0.9607843137254902,
                b: 0.9764705882352941,
            },
            usage: "slate-100",
            family: "custom",
            shade: "",
        },
        {
            name: "emerald-500",
            rgb: {
                r: 0.06274509803921569,
                g: 0.7254901960784313,
                b: 0.5058823529411764,
            },
            usage: "emerald-500",
            family: "custom",
            shade: "",
        },
        {
            name: "rose-500",
            rgb: {
                r: 0.9568627450980393,
                g: 0.24705882352941178,
                b: 0.3686274509803922,
            },
            usage: "rose-500",
            family: "custom",
            shade: "",
        },
        {
            name: "amber-500",
            rgb: {
                r: 0.9607843137254902,
                g: 0.6196078431372549,
                b: 0.043137254901960784,
            },
            usage: "amber-500",
            family: "custom",
            shade: "",
        },
    ],
    shadeScales: {
        slate: [
            {
                shade: "50",
                rgb: {
                    r: 0.97,
                    g: 0.98,
                    b: 0.98,
                },
            },
            {
                shade: "100",
                rgb: {
                    r: 0.94,
                    g: 0.95,
                    b: 0.96,
                },
            },
            {
                shade: "200",
                rgb: {
                    r: 0.89,
                    g: 0.9,
                    b: 0.92,
                },
            },
            {
                shade: "300",
                rgb: {
                    r: 0.8,
                    g: 0.82,
                    b: 0.85,
                },
            },
            {
                shade: "400",
                rgb: {
                    r: 0.58,
                    g: 0.63,
                    b: 0.69,
                },
            },
            {
                shade: "500",
                rgb: {
                    r: 0.4,
                    g: 0.45,
                    b: 0.53,
                },
            },
            {
                shade: "600",
                rgb: {
                    r: 0.28,
                    g: 0.33,
                    b: 0.41,
                },
            },
            {
                shade: "700",
                rgb: {
                    r: 0.2,
                    g: 0.25,
                    b: 0.33,
                },
            },
            {
                shade: "800",
                rgb: {
                    r: 0.12,
                    g: 0.16,
                    b: 0.23,
                },
            },
            {
                shade: "900",
                rgb: {
                    r: 0.06,
                    g: 0.09,
                    b: 0.16,
                },
            },
            {
                shade: "950",
                rgb: {
                    r: 0.01,
                    g: 0.02,
                    b: 0.06,
                },
            },
        ],
        blue: [
            {
                shade: "400",
                rgb: {
                    r: 0.38,
                    g: 0.57,
                    b: 0.97,
                },
            },
            {
                shade: "500",
                rgb: {
                    r: 0.24,
                    g: 0.47,
                    b: 0.96,
                },
            },
            {
                shade: "600",
                rgb: {
                    r: 0.15,
                    g: 0.39,
                    b: 0.92,
                },
            },
            {
                shade: "700",
                rgb: {
                    r: 0.11,
                    g: 0.31,
                    b: 0.85,
                },
            },
            {
                shade: "800",
                rgb: {
                    r: 0.12,
                    g: 0.27,
                    b: 0.7,
                },
            },
        ],
        green: [
            {
                shade: "400",
                rgb: {
                    r: 0.29,
                    g: 0.78,
                    b: 0.47,
                },
            },
            {
                shade: "500",
                rgb: {
                    r: 0.13,
                    g: 0.72,
                    b: 0.35,
                },
            },
            {
                shade: "600",
                rgb: {
                    r: 0.09,
                    g: 0.6,
                    b: 0.29,
                },
            },
            {
                shade: "700",
                rgb: {
                    r: 0.08,
                    g: 0.49,
                    b: 0.25,
                },
            },
        ],
        amber: [
            {
                shade: "400",
                rgb: {
                    r: 0.98,
                    g: 0.74,
                    b: 0.18,
                },
            },
            {
                shade: "500",
                rgb: {
                    r: 0.96,
                    g: 0.62,
                    b: 0.04,
                },
            },
            {
                shade: "600",
                rgb: {
                    r: 0.85,
                    g: 0.5,
                    b: 0.01,
                },
            },
            {
                shade: "700",
                rgb: {
                    r: 0.71,
                    g: 0.38,
                    b: 0.01,
                },
            },
        ],
        red: [
            {
                shade: "400",
                rgb: {
                    r: 0.97,
                    g: 0.44,
                    b: 0.44,
                },
            },
            {
                shade: "500",
                rgb: {
                    r: 0.94,
                    g: 0.27,
                    b: 0.27,
                },
            },
            {
                shade: "600",
                rgb: {
                    r: 0.86,
                    g: 0.15,
                    b: 0.15,
                },
            },
            {
                shade: "700",
                rgb: {
                    r: 0.73,
                    g: 0.11,
                    b: 0.11,
                },
            },
        ],
    },
    componentTree: [
        {
            name: "SessionPickerLayout",
            props: [
                "maxWidth",
                "paddingY",
                "gap",
                "background",
            ],
            children: [
                "TopBar",
                "GreetingHeader",
                "StatStrip",
                "SessionConfigCard",
                "StartSessionButton",
                "SettingsDialog",
            ],
        },
        {
            name: "TopBar",
            props: [
                "height",
                "background",
                "showBackArrow",
                "settingsIcon",
                "settingsIconSize",
                "ariaLabel",
                "ariaHasPopup",
            ],
            children: [
            ],
        },
        {
            name: "GreetingHeader",
            props: [
                "greeting",
                "subtitle",
                "timeOfDay",
                "typography",
                "subtitleTypography",
            ],
            children: [
            ],
        },
        {
            name: "StatStrip",
            props: [
                "streakDays",
                "weeklyHours",
                "totalSessions",
                "dividerColor",
                "streakColor",
                "ariaHidden",
            ],
            children: [
            ],
        },
        {
            name: "SessionConfigCard",
            props: [
                "borderRadius",
                "shadow",
                "padding",
                "gap",
                "background",
            ],
            children: [
                "SessionTypeCardGroup",
                "DurationSection",
                "ToggleSection",
            ],
        },
        {
            name: "SessionTypeCardGroup",
            props: [
                "role",
                "ariaLabel",
                "gap",
                "selectedId",
            ],
            children: [
                "SessionTypeCard",
            ],
        },
        {
            name: "SessionTypeCard",
            props: [
                "sessionTypeId",
                "name",
                "description",
                "icon",
                "colorToken",
                "defaultDuration",
                "isSelected",
                "role",
                "ariaChecked",
                "borderRadius",
                "shadow",
                "selectedShadow",
                "paddingX",
                "paddingY",
                "minHeight",
                "minWidth",
                "transitionDuration",
            ],
            children: [
                "Avatar",
            ],
        },
        {
            name: "Avatar",
            props: [
                "size",
                "background",
                "iconColor",
                "ariaHidden",
            ],
            children: [
            ],
        },
        {
            name: "DurationSection",
            props: [
                "label",
                "gap",
                "typography",
            ],
            children: [
                "DurationChipRow",
                "CustomDurationInput",
            ],
        },
        {
            name: "DurationChipRow",
            props: [
                "role",
                "ariaLabel",
                "gap",
                "chips",
                "selectedValue",
                "chipWidth",
                "chipHeight",
                "borderRadius",
            ],
            children: [
                "Badge",
            ],
        },
        {
            name: "Badge",
            props: [
                "role",
                "ariaChecked",
                "value",
                "label",
                "isSelected",
                "variant",
                "borderRadius",
                "minWidth",
                "minHeight",
                "typography",
            ],
            children: [
            ],
        },
        {
            name: "CustomDurationInput",
            props: [
                "isVisible",
                "slideAnimationDuration",
                "value",
                "min",
                "max",
                "step",
                "ariaLabel",
                "ariaValueMin",
                "ariaValueMax",
                "ariaValueNow",
                "borderRadius",
                "background",
                "paddingX",
                "paddingY",
            ],
            children: [
                "Input",
                "Button",
            ],
        },
        {
            name: "Input",
            props: [
                "type",
                "ariaLabel",
                "ariaValueMin",
                "ariaValueMax",
                "ariaValueNow",
                "borderRadius",
                "background",
                "paddingX",
                "paddingY",
            ],
            children: [
            ],
        },
        {
            name: "ToggleSection",
            props: [
                "gap",
                "conditionalBreakReminder",
            ],
            children: [
                "BreakReminderToggle",
                "AmbientSoundToggle",
            ],
        },
        {
            name: "BreakReminderToggle",
            props: [
                "isVisible",
                "isChecked",
                "role",
                "ariaChecked",
                "ariaLabel",
                "label",
                "subLabel",
                "minHeight",
                "transitionDuration",
            ],
            children: [
            ],
        },
        {
            name: "AmbientSoundToggle",
            props: [
                "isChecked",
                "role",
                "ariaChecked",
                "ariaLabel",
                "label",
                "soundLabel",
                "minHeight",
            ],
            children: [
            ],
        },
        {
            name: "StartSessionButton",
            props: [
                "isDisabled",
                "ariaDisabled",
                "ariaLabel",
                "label",
                "height",
                "borderRadius",
                "typography",
                "variant",
                "transitionDuration",
            ],
            children: [
                "Button",
            ],
        },
        {
            name: "SettingsDialog",
            props: [
                "isOpen",
                "role",
                "ariaModal",
                "ariaLabelledBy",
                "maxWidth",
                "borderRadius",
                "shadow",
                "zIndex",
                "overlayColor",
                "paddingX",
                "paddingY",
                "gap",
            ],
            children: [
                "SoundSelectorChipGroup",
                "NotificationsToggle",
                "DarkModeToggle",
            ],
        },
    ],
    tokenBindings: {
        "SessionPickerLayout.background": "background-primary",
        "SessionPickerLayout.gap": "32",
        "SessionPickerLayout.paddingY": "48",
        "TopBar.background": "surface-primary",
        "TopBar.iconColor": "text-secondary",
        "GreetingHeader.color": "text-primary",
        "GreetingHeader.typography": "heading-1",
        "GreetingHeader.subtitleTypography": "body",
        "GreetingHeader.subtitleColor": "text-secondary",
        "StatStrip.streakColor": "warning",
        "StatStrip.textColor": "text-secondary",
        "StatStrip.typography": "body",
        "StatStrip.dividerColor": "border-default",
        "SessionConfigCard.background": "surface-primary",
        "SessionConfigCard.shadow": "elevation-1",
        "SessionConfigCard.borderRadius": "large",
        "SessionConfigCard.gap": "24",
        "SessionTypeCardGroup.gap": "12",
        "SessionTypeCard.background": "surface-primary",
        "SessionTypeCard.selectedBackground": "surface-elevated",
        "SessionTypeCard.shadow": "elevation-1",
        "SessionTypeCard.selectedShadow": "elevation-2",
        "SessionTypeCard.borderRadius": "large",
        "SessionTypeCard.titleTypography": "heading-2",
        "SessionTypeCard.titleColor": "text-primary",
        "SessionTypeCard.descriptionTypography": "body",
        "SessionTypeCard.descriptionColor": "text-secondary",
        "SessionTypeCard.selectedBorderColor": "cta-primary",
        "SessionTypeCard.selectedBackground2": "surface-elevated",
        "SessionTypeCard.transitionDuration": "duration-fast",
        "SessionTypeCard.minHeight": "touch-min-height",
        "Avatar.unselectedBackground": "surface-secondary",
        "Avatar.unselectedIconColor": "text-secondary",
        "Avatar.selectedBackground": "cta-primary",
        "Avatar.selectedIconColor": "text-on-cta",
        "DurationSection.labelTypography": "heading-3",
        "DurationSection.labelColor": "text-primary",
        "DurationSection.gap": "12",
        "DurationChipRow.gap": "8",
        "Badge.selectedBackground": "cta-primary",
        "Badge.selectedTextColor": "text-on-cta",
        "Badge.unselectedBackground": "surface-primary",
        "Badge.unselectedTextColor": "text-primary",
        "Badge.unselectedBorderColor": "border-default",
        "Badge.borderRadius": "pill",
        "Badge.typography": "label",
        "CustomDurationInput.background": "surface-input",
        "CustomDurationInput.borderColor": "border-default",
        "CustomDurationInput.focusBorderColor": "border-focus",
        "CustomDurationInput.borderRadius": "small",
        "CustomDurationInput.textColor": "text-primary",
        "CustomDurationInput.typography": "body",
        "CustomDurationInput.transitionDuration": "duration-fast",
        "ToggleSection.gap": "12",
        "BreakReminderToggle.labelTypography": "body",
        "BreakReminderToggle.labelColor": "text-primary",
        "BreakReminderToggle.subLabelTypography": "label",
        "BreakReminderToggle.subLabelColor": "text-secondary",
        "BreakReminderToggle.activeColor": "cta-primary",
        "BreakReminderToggle.transitionDuration": "duration-fast",
        "AmbientSoundToggle.labelTypography": "body",
        "AmbientSoundToggle.labelColor": "text-primary",
        "AmbientSoundToggle.activeColor": "cta-primary",
        "StartSessionButton.activeBackground": "cta-primary",
        "StartSessionButton.activeTextColor": "text-on-cta",
        "StartSessionButton.disabledBackground": "border-default",
        "StartSessionButton.disabledTextColor": "text-disabled",
        "StartSessionButton.borderRadius": "medium",
        "StartSessionButton.typography": "heading-2",
        "StartSessionButton.transitionDuration": "duration-fast",
        "SettingsDialog.background": "surface-primary",
        "SettingsDialog.shadow": "elevation-3",
        "SettingsDialog.borderRadius": "large",
        "SettingsDialog.overlay": "overlay",
        "SettingsDialog.zIndex": "z-modal",
        "SettingsDialog.titleTypography": "heading-2",
        "SettingsDialog.titleColor": "text-primary",
        "SettingsDialog.gap": "24",
    },
    typographyScale: [
        {
            role: "heading-1",
            fontSize: 24,
            fontWeight: 700,
            lineHeight: 1.3,
        },
        {
            role: "heading-2",
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1.4,
        },
        {
            role: "heading-3",
            fontSize: 15,
            fontWeight: 600,
            lineHeight: 1.4,
        },
        {
            role: "body",
            fontSize: 14,
            fontWeight: 400,
            lineHeight: 1.5,
        },
        {
            role: "label",
            fontSize: 12,
            fontWeight: 500,
            lineHeight: 1.4,
        },
        {
            role: "small",
            fontSize: 64,
            fontWeight: 300,
            lineHeight: 1,
        },
    ],
    spacingScale: [
        {
            role: "spacing-0",
            value: 4,
        },
        {
            role: "spacing-1",
            value: 8,
        },
        {
            role: "spacing-2",
            value: 12,
        },
        {
            role: "spacing-3",
            value: 16,
        },
        {
            role: "spacing-4",
            value: 24,
        },
        {
            role: "spacing-5",
            value: 32,
        },
        {
            role: "spacing-6",
            value: 48,
        },
        {
            role: "spacing-7",
            value: 64,
        },
    ],
};
export default dsCtxMock;