const designPenpotMockResearchInput = {
    moduleId: "session-picker",
    taskId: "task_design_penpot_1774770669051",
    prdRequirements: [
        "Entry screen where users select a session type (Deep Work, Meditation, Power Nap), configure duration via preset chips or custom input, toggle break reminders and ambient sound, and initiate the session. Displays a greeting header with time-of-day awareness, a stat strip showing streak, weekly hours, and total sessions, and a disabled Start button until a session type is selected.",
        "# ZENFLOW\n## Focus & Meditation Timer — UX Screen Specification PRD\n\n| Field | Value |\n|-------|-------|\n| Version | 1.0 |\n| Date | March 27, 2026 |\n| Author | Product Team |\n| Status | Ready for UX Agent Build |\n| Screens | 3 (Session Picker → Active Timer → Session Summary) |\n| Platform | Desktop |\n| Complexity | Medium (~40–60 shapes per screen) |\n\n---\n\n## 1. Purpose & Scope\n\nThis PRD defines the UX specification for ZenFlow, a minimal focus and meditation timer app. It is scoped exclusively to visual and interaction design — no backend functionality is required.\n\nThe document covers three screens: choosing a session type and configuring it, running the active timer with ambient visuals, and reviewing session results. The design language is calm, spacious, and deliberate — every element earns its place.\n\n---\n\n## 2. Design System Tokens\n\n### 2.1 Color Palette\n\n| Token | Hex | Usage |\n|-------|-----|-------|\n| indigo-600 | #4F46E5 | Primary CTA, active states, progress fills |\n| indigo-100 | #E0E7FF | Selected card background, light accents |\n| slate-900 | #0F172A | Headings, primary text |\n| slate-500 | #64748B | Secondary text, labels |\n| slate-100 | #F1F5F9 | Page background |\n| emerald-500 | #10B981 | Success states, completed indicators |\n| amber-500 | #F59E0B | Streak badges, warning states |\n| rose-500 | #F43F5E | Stop/cancel actions, error states |\n| white | #FFFFFF | Card surfaces, button text on dark |\n\n### 2.2 Typography\n\n| Role | Size | Weight | Font |\n|------|------|--------|------|\n| Page Title | 24px | 700 | Inter |\n| Section Label | 16px | 600 | Inter |\n| Card Title | 15px | 600 | Inter |\n| Body | 14px | 400 | Inter |\n| Caption | 12px | 500 | Inter |\n| Timer Display | 64px | 300 | Inter (tabular-nums) |\n| Timer Sub-label | 14px | 500 | Inter |\n\n### 2.3 Spacing, Radius & Shadows\n\n- **Base unit:** 4px. Spacing multiples: 4, 8, 12, 16, 24, 32, 48.\n- **Card radius:** 16px. **Button radius:** 12px. **Chip radius:** 20px (fully rounded). **Input radius:** 8px.\n- **Card shadow:** `0 1px 3px rgba(0,0,0,0.08)`. **Elevated:** `0 8px 24px rgba(0,0,0,0.12)`.\n\n### 2.4 Animations\n\n- Micro-interactions: 150ms ease-out.\n- Layout transitions: 250ms ease-in-out.\n- Timer ring progress: continuous linear animation (synced to countdown).\n- Screen transitions: 350ms ease-in-out, vertical slide (20px).\n\n---\n\n## 3. Global Components\n\n### 3.1 Top Bar\n\nHeight: 56px. Background: transparent (blends with page background). No bottom border.\n\n- **Left:** Back arrow icon (24px, slate-500). Hidden on Screen 1. Navigates to previous screen.\n- **Center:** Screen title in section label style. Screen 1: \"ZenFlow\". Screen 2: session type name. Screen 3: \"Session Complete\".\n- **Right:** Settings gear icon (24px, slate-500). Clicking opens the settings dialog (see 3.2). On Screen 2, this is replaced by a mute/unmute icon for ambient sound.\n\n### 3.2 Settings Dialog\n\nA centered modal dialog (max-width: 400px) with dark scrim overlay (fade-in 250ms). Contains:\n\n- **Notifications toggle:** \"Session reminders\" with a toggle switch.\n- **Sound selector:** \"Ambient Sound\" label + a horizontal row of 4 icon chips: None, Rain, Forest, Ocean. Single select. Selected chip: indigo-600 background, white icon. Unselected: slate-100 background, slate-500 icon.\n- **Theme toggle:** \"Dark Mode\" with a toggle switch (note: this PRD specifies light mode only; the toggle is a UI element to render but does not need to function).\n- **Close:** close (×) button at top-right (24px, slate-500). Click scrim or press Escape to dismiss.\n\n---\n\n## 4. Screen 1: Session Picker\n\nThe entry screen. Users choose a session type, configure duration, and begin. The design should feel inviting and unhurried.\n\n### 4.1 Layout\n\nSingle centered column, max-width: 560px. Generous vertical spacing (32px between sections). Background: slate-100.\n\n### 4.2 Greeting Header\n\n- **Line 1:** \"Good morning\" (or afternoon/evening) in page title style, slate-900.\n- **Line 2:** \"What would you like to focus on?\" in body style, slate-500.\n- Below the greeting, a horizontal stat strip showing three inline metrics: \"🔥 12-day streak\" · \"⏱ 4.2 hrs this week\" · \"🧘 38 sessions\". Each metric is body text, separated by a centered dot (·). The streak count uses amber-500 color.\n\n### 4.3 Session Type Cards\n\nThree vertical cards in a single column, stacked with 12px gap between them. Each card is clickable (single select — clicking one deselects the other).\n\n**Card structure (each card):**\n\n- Height: ~100px. White background, 16px radius, card shadow. Padding: 16px.\n- **Left zone:** A 48px circle with a category icon inside (outlined style, slate-500 when unselected, white when selected).\n- **Center zone (to the right of the icon):** Card title (15px, 600 weight) + description line (12px, slate-500). Descriptions: \"Deep Work\" → \"Eliminate distractions, enter flow state\"; \"Meditation\" → \"Guided breathing and mindfulness\"; \"Power Nap\" → \"Short rest with gentle wake alarm\".\n- **Right zone:** A suggested duration pill (e.g., \"25 min\") in caption text, slate-500, inside a rounded chip with slate-100 background.\n- **Selected state:** indigo-100 background, indigo-600 left border (3px), icon circle fills with indigo-600 (icon turns white). Card shadow elevates slightly. Transition: 150ms.\n- **Unselected state:** white background, no left border, icon circle is slate-100 with slate-500 icon.\n\n### 4.4 Duration Configurator\n\nAppears below the cards. Consists of:\n\n#### 4.4.1 Preset Duration Chips\n\nA horizontal row of 5 rounded chips: 5, 15, 25, 45, 60 (minutes). Single select. Selected: indigo-600 background, white text. Unselected: white background, slate-900 text, 1px slate-200 border. Chip size: 48px wide, 36px tall.\n\nWhen a session type is selected, the matching default chip auto-selects (Deep Work → 25, Meditation → 15, Power Nap → 5) with a brief scale-bounce animation (1.1x → 1.0, 150ms).\n\n#### 4.4.2 Custom Duration Input\n\nBelow the chips, a text link: \"Custom duration\" in indigo-600, caption size. Clicking it reveals (slide-down, 200ms) an inline row with:\n\n- A numeric input field (64px wide, centered text, 24px font size) pre-filled with the currently selected duration.\n- \"min\" label to the right of the input in slate-500.\n- Stepper arrows: up/down chevron buttons flanking the input, incrementing/decrementing by 5. Range: 1–120.\n\nSelecting any preset chip hides the custom input (slide-up, 200ms) and selects that chip.\n\n### 4.5 Optional Toggles\n\nTwo rows below the duration configurator, each a horizontal flex row with a label on the left and a toggle switch on the right. Spacing: 12px between rows.\n\n- **\"Break reminder\"** — toggle switch. When on, a sub-label appears below: \"Remind me every 25 min\" in caption, slate-500. This row only visible when session type is \"Deep Work.\"\n- **\"Play ambient sound\"** — toggle switch. When on, the selected sound from settings is shown as a chip to the right of the toggle label (e.g., \"🌧 Rain\"). Visible for all session types.\n\n### 4.6 Start Button\n\nA large, full-width (within the 560px column) CTA button at the bottom. Height: 56px. Background: indigo-600. Text: \"Start Session\" in white, 16px, 600 weight. Border-radius: 12px.\n\n- **Hover:** darken to indigo-700, cursor: pointer. **Active/press:** slight scale-down (0.98).\n- **Disabled state:** if no session type is selected, button is slate-200 background with slate-400 text, cursor: not-allowed.\n- **Click animation:** ripple effect from cursor point (200ms), then screen transitions to Screen 2.\n\n### 4.7 Screen 1 Interaction Matrix\n\n| Element | Interaction | Behavior |\n|---------|-------------|----------|\n| Session Type Card | Click| Select card, deselect others. Update selected state (150ms). Auto-select default duration chip for that type. |\n| Duration Chip | Click| Select chip, deselect others. Hide custom input if visible. Bounce animation (150ms). |\n| \"Custom duration\" link | Click| Slide-down reveal of numeric input (200ms). Link text changes to \"Use preset\" and collapses the input when clicked again. |\n| Custom Duration Stepper | Click+/– | Increment/decrement by 5. Deselect any active preset chip. Number rolls (counter animation). Clamp to 1–120. |\n| Break Reminder Toggle | Click| Toggle on/off. Sub-label slides in/out (150ms). Only visible for Deep Work. |\n| Ambient Sound Toggle | Click| Toggle on/off. Sound chip appears/disappears next to label (150ms). |\n| Start Button | Click| If session selected: ripple animation → navigate to Screen 2 (350ms slide-up). If no session: button is disabled, no action. |\n| Settings Gear | Click| Settings dialog opens (250ms fade-in). Scrim overlay appears. |\n\n---\n\n## 5. Screen 2: Active Timer\n\nThe focused experience. Minimal chrome — the timer dominates. The screen should feel immersive and distraction-free.\n\n### 5.1 Layout\n\nCentered single column, full viewport height. Background: white. No visible scrolling — all content fits in viewport.\n\nThree vertical zones stacked:\n- **Top zone (12%):** Top bar + session label.\n- **Center zone (60%):** Timer ring + time display.\n- **Bottom zone (28%):** Control buttons + progress info.\n\n### 5.2 Timer Ring\n\nA large circular progress ring, centered on screen. Outer diameter: 280px. Ring stroke: 8px. Track (background ring): slate-100. Progress fill: indigo-600, animated continuously counterclockwise as time decreases.\n\n**Inside the ring:**\n\n- **Time remaining:** displayed in timer display style (64px, 300 weight, slate-900, tabular-nums for fixed-width digits). Format: `MM:SS` (e.g., \"24:38\"). When under 1 minute, format changes to `0:SS` and the text color pulses between slate-900 and rose-500 (1s cycle).\n- **Below the time:** a caption label showing the session type (e.g., \"Deep Work\") in slate-500.\n\n**Ring animation:** the stroke-dashoffset decreases linearly to match elapsed time. On pause, the ring fill pulses gently (opacity 0.7 → 1.0, 1.5s cycle) to indicate paused state.\n\n### 5.3 Phase Indicator (Meditation Only)\n\nVisible only for Meditation sessions. A small horizontal segmented bar (240px wide) centered below the timer ring. Three segments: \"Breathe In\" · \"Hold\" · \"Breathe Out\". The active segment is filled with indigo-600; inactive segments are slate-200. Segments transition smoothly (250ms). Below the bar, the current instruction in body text, slate-500 (e.g., \"Breathe in slowly...\").\n\nFor Deep Work and Power Nap, this area is empty — preserving whitespace.\n\n### 5.4 Control Buttons\n\nA horizontal row of three circular icon buttons, centered, with 24px gap between them.\n\n- **Left — Reset:** 48px circle, slate-100 background, slate-500 icon (circular arrow). Click: resets timer to original duration. Confirmation: the ring refills with a quick sweep animation (400ms). Only enabled when timer is paused; disabled (opacity 0.4) when running.\n- **Center — Play/Pause:** 72px circle, indigo-600 background, white icon (play ▶ or pause ⏸). This is the primary control. Clicktoggles play/pause. On pause, icon morphs from pause bars to play triangle (150ms morph animation). On play, reverse morph.\n- **Right — Stop:** 48px circle, rose-100 background, rose-500 icon (square stop). Click: opens a confirmation popover (see 5.5).\n\n### 5.5 Stop Confirmation Popover\n\nA small popover card (240px wide) that appears above the stop button, pointing down with a small triangle tail. White background, 12px radius, elevated shadow. Contains:\n\n- Text: \"End session early?\" in card title style.\n- Two buttons side by side: \"Cancel\" (text button, slate-500) and \"End\" (filled button, rose-500 background, white text).\n- Clicking \"End\" navigates to Screen 3 with whatever time was completed.\n- Clicking \"Cancel\", clicking outside the popover, or pressing Escape dismisses it (fade-out, 150ms).\n\n### 5.6 Progress Info Strip\n\nBelow the control buttons. A horizontal row showing two metrics, centered, separated by a 1px vertical divider (32px tall, slate-200):\n\n- **Left metric:** \"Elapsed\" label (caption, slate-500) + elapsed time value (body, 600 weight, slate-900) in `MM:SS`.\n- **Right metric:** \"Remaining\" label (caption, slate-500) + remaining time value (body, 600 weight, slate-900) in `MM:SS`.\n\n### 5.7 Break Reminder Overlay (Deep Work Only)\n\nWhen the break reminder fires (if enabled, every 25 min), a non-blocking banner slides down from the top (250ms). Height: 56px. Background: indigo-100. Contains:\n\n- Text: \"Time for a short break?\" in body text, indigo-600.\n- Two inline actions: \"Skip\" (text button, slate-500) and \"5 min break\" (small filled button, indigo-600, white text).\n- Clicking \"5 min break\" pauses the main timer and starts a 5-minute break countdown in the same timer ring (ring color changes to emerald-500). When break ends, the ring returns to indigo-600 and the main timer resumes.\n- Auto-dismisses after 10 seconds if no action taken (slide-up, 250ms).\n\n### 5.8 Screen 2 Interaction Matrix\n\n| Element | Interaction | Behavior |\n|---------|-------------|----------|\n| Play/Pause Button | Click| Toggle timer state. Icon morphs (150ms). Ring pauses/resumes animation. Paused ring pulses gently. |\n| Reset Button | Click(when paused) | Timer resets to original duration. Ring refills (400ms sweep). Reset button disabled while running. |\n| Stop Button | Click| Show stop confirmation popover above the button. Timer continues running in background. |\n| Stop Popover — \"End\" | Click| Navigate to Screen 3 with elapsed time recorded. Fade-out transition (350ms). |\n| Stop Popover — \"Cancel\" | Click| Dismiss popover (150ms). Timer continues. |\n| Mute Icon (top right) | Click| Toggle ambient sound on/off. Icon switches between speaker and muted-speaker (150ms). |\n| Break Banner — \"5 min break\" | Click| Pause main timer. Ring color transitions to emerald-500 (250ms). 5-min break countdown starts. |\n| Break Banner — \"Skip\" | Click| Dismiss banner (slide-up, 250ms). Timer continues. |\n\n---\n\n## 6. Screen 3: Session Summary\n\nShown after a session completes (timer reaches 0:00) or is ended early. Celebrates the user and presents stats. Should feel rewarding.\n\n### 6.1 Layout\n\nSingle centered column, max-width: 560px. Background: white. Vertical stacking with generous spacing (32px between sections).\n\n### 6.2 Completion Header\n\n- **Icon:** A 64px circle with emerald-500 background and a white checkmark icon (if session completed fully) or an amber-500 background with a white clock icon (if ended early).\n- **Heading:** \"Great focus session!\" (completed) or \"Session ended\" (early). Page title style, centered.\n- **Sub-line:** \"You stayed focused for 25 minutes\" (or actual elapsed time). Body text, slate-500, centered.\n\n### 6.3 Session Stats Card\n\nA single white card with 16px radius and card shadow. Padding: 24px. Contains a 2×2 grid of stat cells with 1px slate-100 dividers between them (both horizontal and vertical).\n\nEach stat cell contains:\n- **Value** (20px, 700 weight, slate-900) centered.\n- **Label** (12px, 500 weight, slate-500) centered below the value.\n\nThe four stats:\n\n| Cell | Value Example | Label |\n|------|---------------|-------|\n| Top-left | 25:00 | Duration |\n| Top-right | 92% | Focus Score |\n| Bottom-left | 0 | Distractions |\n| Bottom-right | 🔥 13 | Day Streak |\n\nThe streak cell value uses amber-500 color. If the streak incremented this session, a small \"+1\" badge appears next to the streak number in emerald-500, with a brief pop-in animation (scale 0 → 1, 200ms).\n\n### 6.4 Session Note\n\nBelow the stats card, a single-line text input styled as a minimal underline input (no box border, just a bottom line in slate-200). Placeholder: \"Add a note about this session...\" in slate-400. On focus, the underline transitions to indigo-600 (150ms).\n\n- Max length: 140 characters. Character counter appears on focus in the bottom-right (caption, slate-400), turning rose-500 at 120+.\n- Pressing Enter or blurring the field saves the note (show a brief \"Saved\" toast, 1.5s auto-dismiss).\n\n### 6.5 Action Buttons\n\nTwo buttons stacked vertically with 12px gap, full width within the 560px column.\n\n- **Primary:** \"Start Another Session\" — indigo-600 background, white text, 48px height, 12px radius. Navigates to Screen 1.\n- **Secondary:** \"Done\" — white background, 1px slate-200 border, slate-900 text, 48px height, 12px radius. Navigates to a conceptual home/close state (for UX agent testing, this can navigate to Screen 1 as well).\n\n### 6.6 Session History Preview\n\nBelow the buttons, a section with a label: \"Recent Sessions\" (section label style, slate-900, left-aligned). Below the label, a vertical list of the 3 most recent sessions (including the one just completed). Each row is:\n\n- **Left:** A small colored dot (8px circle): indigo-600 for Deep Work, emerald-500 for Meditation, amber-500 for Power Nap.\n- **Center:** Session type name (body, slate-900) + date/time (caption, slate-500) on two lines.\n- **Right:** Duration in body text, 600 weight (e.g., \"25 min\").\n\nThe most recent session (just completed) has a subtle indigo-50 background highlight. Rows are separated by 1px slate-100 dividers. Row height: ~56px. Rows are not clickable (display only).\n\n### 6.7 Screen 3 Interaction Matrix\n\n| Element | Interaction | Behavior |\n|---------|-------------|----------|\n| Session Note Input | Focus | Underline transitions to indigo-600 (150ms). Character counter appears (fade-in). |\n| Session Note Input | Blur / Enter | Note saved. Brief \"Saved\" toast at bottom-center (fade-in 200ms, auto-dismiss 1.5s). |\n| \"Start Another Session\" | Click| Navigate to Screen 1. Slide-down transition (350ms). Session type and duration reset to defaults. |\n| \"Done\" | Click| Navigate to Screen 1 (same as above for UX testing purposes). |\n| Streak \"+1\" Badge | Auto | Pop-in animation on page load (200ms delay after header appears). |\n\n---\n\n## 7. Screen Flow & Navigation\n\n| From | Action | To | Transition |\n|------|--------|----|------------|\n| Screen 1 | Click\"Start Session\" | Screen 2 | Slide up (350ms) |\n| Screen 2 | Timer reaches 0:00 | Screen 3 | Fade + scale-up (400ms) |\n| Screen 2 | ClickStop → \"End\" | Screen 3 | Fade (350ms) |\n| Screen 3 | Click\"Start Another\" | Screen 1 | Slide down (350ms) |\n| Screen 3 | Click\"Done\" | Screen 1 | Slide down (350ms) |\n| Any | Clickback arrow | Previous screen | Slide right (300ms) |\n\n---\n\n## 8. Responsive Behavior\n\nThis app is a desktop application with a centered content column. The layout is optimized for larger screens with ample whitespace.\n\n| Breakpoint | Behavior |\n|------------|----------|\n| 768–1024px | Centered 520px column. Timer ring at 280px diameter. Comfortable spacing. |\n| 1024–1440px | Centered 560px column. Timer ring scales up to 320px diameter. Generous vertical whitespace. |\n| > 1440px | Centered 600px column. Timer ring at 340px diameter. Maximum whitespace for a spacious, calm feel. |\n\n---\n\n## 9. Accessibility\n\n- All buttons and interactive elements have minimum 36×36px click targets.\n- Timer display uses `role=\"timer\"` and `aria-live=\"polite\"` to announce time changes every 30 seconds (not every second, to avoid noise).\n- Toggle switches have associated labels via `aria-label`.\n- Focus rings: 2px indigo-600 outline, 2px offset on all interactive elements. Full keyboard navigation support (Tab, Enter, Space, Escape).\n- Reduced motion: respect `prefers-reduced-motion`. Replace ring animation with static progress fill. Disable pulse effects. Replace slide transitions with instant cuts.\n- Color is never the sole indicator — all states use icon or text changes alongside color.\n\n---\n\n## 10. Empty & Error States\n\n- **No session history (Screen 3):** The \"Recent Sessions\" section shows a single centered line: \"This is your first session! 🎉\" in body text, slate-500.\n- **Timer interrupted (window minimized or unfocused):** On return, if the timer was running, show a small banner: \"Timer was paused while away\" with a \"Resume\" button. Timer state preserved.\n- **Sound playback failure:** Ambient sound icon shows a small warning triangle overlay. Tooltip on hover: \"Sound unavailable. Check your system volume.\"",
    ],
    designTokensSpec: {
        version: "1.0",
        created_by: "agentforge-init-llm",
        colors: {
            primitive: {
                "indigo-600": "#4F46E5",
                "indigo-100": "#E0E7FF",
                "indigo-50": "#EEF2FF",
                "slate-900": "#0F172A",
                "slate-500": "#64748B",
                "slate-100": "#F1F5F9",
                "emerald-500": "#10B981",
                "rose-500": "#F43F5E",
                "amber-500": "#F59E0B",
            },
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
        typography: {
            font_families: {
                display: "Inter",
                body: "Inter",
            },
            scale: [
                {
                    role: "heading-1",
                    size: 24,
                    weight: 700,
                    family: "display",
                    line_height: 1.3,
                },
                {
                    role: "heading-2",
                    size: 16,
                    weight: 600,
                    family: "display",
                    line_height: 1.4,
                },
                {
                    role: "heading-3",
                    size: 15,
                    weight: 600,
                    family: "display",
                    line_height: 1.4,
                },
                {
                    role: "body",
                    size: 14,
                    weight: 400,
                    family: "display",
                    line_height: 1.5,
                },
                {
                    role: "label",
                    size: 12,
                    weight: 500,
                    family: "display",
                    line_height: 1.4,
                },
                {
                    role: "small",
                    size: 64,
                    weight: 300,
                    family: "display",
                    line_height: 1,
                },
            ],
        },
        spacing: {
            unit: 8,
            scale: [
                4,
                8,
                12,
                16,
                24,
                32,
                48,
                64,
            ],
        },
        borders: {
            radius: {
                small: 8,
                medium: 12,
                large: 16,
                pill: 9999,
            },
        },
        touch_targets: {
            minimum_height: 44,
            minimum_width: 44,
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
        layout: {
            grid: {
                columns: 12,
                gutter: 24,
                margin: 24,
            },
            content_max_width: 1280,
            breakpoints: {
                mobile: 640,
                tablet: 768,
                desktop: 1024,
                wide: 1440,
            },
        },
        z_index: {
            dropdown: 1000,
            sticky: 1100,
            modal: 1200,
            toast: 1300,
            tooltip: 1400,
        },
        opacity: {
            scale: {
                subtle: 0.1,
                muted: 0.3,
                disabled: 0.38,
                overlay: 0.5,
            },
        },
        motion: {
            durations: {
                fast: 150,
                normal: 250,
                slow: 350,
            },
            easings: {
                default: "ease-in-out",
                emphasized: "cubic-bezier(0.34,1.56,0.64,1)",
            },
        },
        state: {
            hover_opacity: 0.08,
            disabled_opacity: 0.38,
            focus_ring: {
                color: "cta-primary",
                width: 2,
                offset: 2,
            },
        },
    },
    pageContext: {
        targetPage: {
            id: "session-picker",
            name: "Session Picker",
            description: "Entry screen where users select a session type (Deep Work, Meditation, Power Nap), configure duration via preset chips or custom input, toggle break reminders and ambient sound, and initiate the session. Displays a greeting header with time-of-day awareness, a stat strip showing streak, weekly hours, and total sessions, and a disabled Start button until a session type is selected.",
            route: "/",
            status: "approved",
            components: [
                "TopBar",
                "GreetingHeader",
                "StatStrip",
                "SessionTypeCard",
                "DurationChipRow",
                "CustomDurationInput",
                "BreakReminderToggle",
                "AmbientSoundToggle",
                "StartSessionButton",
                "SettingsDialog",
            ],
            data_sources: [
                "SessionType",
                "UserStats",
                "UserSettings",
            ],
            viewports: [
                1440,
            ],
        },
        allPages: [
            {
                id: "session-picker",
                name: "Session Picker",
                description: "Entry screen where users select a session type (Deep Work, Meditation, Power Nap), configure duration via preset chips or custom input, toggle break reminders and ambient sound, and initiate the session. Displays a greeting header with time-of-day awareness, a stat strip showing streak, weekly hours, and total sessions, and a disabled Start button until a session type is selected.",
                route: "/",
                status: "approved",
                components: [
                    "TopBar",
                    "GreetingHeader",
                    "StatStrip",
                    "SessionTypeCard",
                    "DurationChipRow",
                    "CustomDurationInput",
                    "BreakReminderToggle",
                    "AmbientSoundToggle",
                    "StartSessionButton",
                    "SettingsDialog",
                ],
                data_sources: [
                    "SessionType",
                    "UserStats",
                    "UserSettings",
                ],
                viewports: [
                    1440,
                ],
            },
            {
                id: "active-timer",
                name: "Active Timer",
                description: "Immersive timer screen showing a large circular progress ring with live countdown, play/pause/reset/stop controls, elapsed and remaining time strip, a meditation phase indicator (Meditation sessions only), a break reminder banner (Deep Work only), and a stop confirmation popover. The mute icon in the top bar toggles ambient sound. Timer state is preserved on window blur.",
                route: "/session/active",
                status: "approved",
                components: [
                    "TopBar",
                    "TimerRing",
                    "TimerDisplay",
                    "MeditationPhaseBar",
                    "PlayPauseButton",
                    "ResetButton",
                    "StopButton",
                    "StopConfirmationPopover",
                    "ProgressInfoStrip",
                    "BreakReminderBanner",
                    "MuteToggleIcon",
                    "AwayPauseBanner",
                ],
                data_sources: [
                    "ActiveSession",
                    "SessionType",
                    "UserSettings",
                ],
                viewports: [
                    1440,
                ],
            },
            {
                id: "session-summary",
                name: "Session Summary",
                description: "Post-session screen celebrating completion or early end. Shows a contextual icon and heading, a 2x2 stats card (duration, focus score, distractions, streak), an inline note input with character counter and save toast, primary and secondary navigation buttons, and a recent sessions history list with the just-completed session highlighted.",
                route: "/session/summary",
                status: "approved",
                components: [
                    "TopBar",
                    "CompletionHeader",
                    "SessionStatsCard",
                    "SessionNoteInput",
                    "StartAnotherButton",
                    "DoneButton",
                    "RecentSessionsList",
                    "SavedToast",
                    "StreakBadge",
                ],
                data_sources: [
                    "CompletedSession",
                    "SessionHistory",
                    "UserStats",
                ],
                viewports: [
                    1440,
                ],
            },
        ],
        models: [
            {
                id: "session-type",
                name: "SessionType",
                fields: [
                    {
                        name: "id",
                        type: "string",
                    },
                    {
                        name: "name",
                        type: "string",
                    },
                    {
                        name: "description",
                        type: "string",
                    },
                    {
                        name: "default_duration_minutes",
                        type: "integer",
                    },
                    {
                        name: "icon",
                        type: "string",
                    },
                    {
                        name: "color_token",
                        type: "string",
                    },
                    {
                        name: "created_at",
                        type: "datetime",
                    },
                ],
                db_table: "session_types",
            },
            {
                id: "user-stats",
                name: "UserStats",
                fields: [
                    {
                        name: "id",
                        type: "string",
                    },
                    {
                        name: "user_id",
                        type: "string",
                    },
                    {
                        name: "current_streak_days",
                        type: "integer",
                    },
                    {
                        name: "total_sessions",
                        type: "integer",
                    },
                    {
                        name: "weekly_hours",
                        type: "float",
                    },
                    {
                        name: "total_hours",
                        type: "float",
                    },
                    {
                        name: "last_session_date",
                        type: "datetime",
                    },
                    {
                        name: "created_at",
                        type: "datetime",
                    },
                    {
                        name: "updated_at",
                        type: "datetime",
                    },
                ],
                db_table: "user_stats",
            },
            {
                id: "user-settings",
                name: "UserSettings",
                fields: [
                    {
                        name: "id",
                        type: "string",
                    },
                    {
                        name: "user_id",
                        type: "string",
                    },
                    {
                        name: "notifications_enabled",
                        type: "boolean",
                    },
                    {
                        name: "ambient_sound",
                        type: "string",
                    },
                    {
                        name: "dark_mode_enabled",
                        type: "boolean",
                    },
                    {
                        name: "default_break_reminder",
                        type: "boolean",
                    },
                    {
                        name: "default_ambient_sound_enabled",
                        type: "boolean",
                    },
                    {
                        name: "created_at",
                        type: "datetime",
                    },
                    {
                        name: "updated_at",
                        type: "datetime",
                    },
                ],
                db_table: "user_settings",
            },
        ],
        apiEndpoints: [
            {
                id: "get-session-types",
                method: "GET",
                path: "/api/session-types",
                description: "Returns all available session types with their metadata, default durations, icons, and color tokens for rendering the session picker cards.",
                query_params: [
                ],
                response: {
                    type: "array",
                    schema_ref: "SessionType",
                },
                auth: "none",
                status: "planned",
            },
            {
                id: "get-user-stats",
                method: "GET",
                path: "/api/user/stats",
                description: "Returns the current user's aggregate stats including streak, weekly hours, and total session count for display in the session picker stat strip and session summary.",
                query_params: [
                ],
                response: {
                    type: "object",
                    schema_ref: "UserStats",
                },
                auth: "none",
                status: "planned",
            },
            {
                id: "get-user-settings",
                method: "GET",
                path: "/api/user/settings",
                description: "Returns the user's persisted settings including ambient sound preference, notification toggle, and dark mode preference for the settings dialog and session picker toggles.",
                query_params: [
                ],
                response: {
                    type: "object",
                    schema_ref: "UserSettings",
                },
                auth: "none",
                status: "planned",
            },
            {
                id: "update-user-settings",
                method: "PATCH",
                path: "/api/user/settings",
                description: "Updates one or more user settings fields. Used when the user changes ambient sound, toggles notifications, or adjusts dark mode in the settings dialog.",
                query_params: [
                ],
                response: {
                    type: "object",
                    schema_ref: "UserSettings",
                },
                auth: "none",
                status: "planned",
            },
        ],
    },
}
export default designPenpotMockResearchInput;