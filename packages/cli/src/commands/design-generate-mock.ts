import { Ok } from "@agentforge/core";

const spec = {
    pages: [
        {
            id: "session-picker",
            name: "Session Picker",
            description: "Entry screen where users select a session type (Deep Work, Meditation, Power Nap), configure duration via preset chips or custom input, toggle break reminders and ambient sound, and initiate the session. Displays a greeting header with time-of-day awareness, a stat strip showing streak, weekly hours, and total sessions, and a disabled Start button until a session type is selected.",
            route: "/",
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
            id: "session",
            name: "Session",
            fields: [
                {
                    name: "id",
                    type: "string",
                },
                {
                    name: "session_type_id",
                    type: "string",
                },
                {
                    name: "planned_duration_minutes",
                    type: "integer",
                },
                {
                    name: "actual_duration_seconds",
                    type: "integer",
                },
                {
                    name: "status",
                    type: "string",
                },
                {
                    name: "completed_fully",
                    type: "boolean",
                },
                {
                    name: "focus_score",
                    type: "integer",
                },
                {
                    name: "distraction_count",
                    type: "integer",
                },
                {
                    name: "ambient_sound",
                    type: "string",
                },
                {
                    name: "break_reminder_enabled",
                    type: "boolean",
                },
                {
                    name: "note",
                    type: "string",
                },
                {
                    name: "started_at",
                    type: "datetime",
                },
                {
                    name: "ended_at",
                    type: "datetime",
                },
                {
                    name: "created_at",
                    type: "datetime",
                },
            ],
            db_table: "sessions",
        },
        {
            id: "active-session",
            name: "ActiveSession",
            fields: [
                {
                    name: "id",
                    type: "string",
                },
                {
                    name: "session_id",
                    type: "string",
                },
                {
                    name: "session_type_id",
                    type: "string",
                },
                {
                    name: "planned_duration_seconds",
                    type: "integer",
                },
                {
                    name: "elapsed_seconds",
                    type: "integer",
                },
                {
                    name: "is_paused",
                    type: "boolean",
                },
                {
                    name: "is_on_break",
                    type: "boolean",
                },
                {
                    name: "break_duration_seconds",
                    type: "integer",
                },
                {
                    name: "ambient_sound",
                    type: "string",
                },
                {
                    name: "is_muted",
                    type: "boolean",
                },
                {
                    name: "last_synced_at",
                    type: "datetime",
                },
                {
                    name: "created_at",
                    type: "datetime",
                },
            ],
            db_table: "active_sessions",
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
        {
            id: "session-note",
            name: "SessionNote",
            fields: [
                {
                    name: "id",
                    type: "string",
                },
                {
                    name: "session_id",
                    type: "string",
                },
                {
                    name: "content",
                    type: "string",
                },
                {
                    name: "character_count",
                    type: "integer",
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
            db_table: "session_notes",
        },
    ],
    endpoints: [
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
        },
        {
            id: "create-session",
            method: "POST",
            path: "/api/sessions",
            description: "Creates a new session record when the user clicks Start Session. Accepts session type, planned duration, ambient sound selection, and break reminder preference. Returns the created session and an active session state object.",
            query_params: [
            ],
            response: {
                type: "object",
                schema_ref: "Session",
            },
            auth: "none",
        },
        {
            id: "get-active-session",
            method: "GET",
            path: "/api/sessions/active",
            description: "Returns the current active session state including elapsed time, pause state, break state, and mute status. Used to restore timer state when the user returns to the active timer screen after window blur.",
            query_params: [
            ],
            response: {
                type: "object",
                schema_ref: "ActiveSession",
            },
            auth: "none",
        },
        {
            id: "update-active-session",
            method: "PATCH",
            path: "/api/sessions/active",
            description: "Syncs the active session state including elapsed seconds, pause status, break status, and mute status. Called periodically and on state changes (pause, resume, mute, break start/end) to persist timer state server-side.",
            query_params: [
            ],
            response: {
                type: "object",
                schema_ref: "ActiveSession",
            },
            auth: "none",
        },
        {
            id: "complete-session",
            method: "POST",
            path: "/api/sessions/{id}/complete",
            description: "Marks a session as completed (fully or early). Accepts actual duration in seconds and completion status. Triggers streak recalculation and focus score computation server-side. Returns the finalized session with all stats.",
            query_params: [
            ],
            response: {
                type: "object",
                schema_ref: "Session",
            },
            auth: "none",
        },
        {
            id: "get-session-summary",
            method: "GET",
            path: "/api/sessions/{id}/summary",
            description: "Returns the full summary data for a completed session including duration, focus score, distraction count, and updated streak for display on the Session Summary screen.",
            query_params: [
            ],
            response: {
                type: "object",
                schema_ref: "Session",
            },
            auth: "none",
        },
        {
            id: "get-session-history",
            method: "GET",
            path: "/api/sessions",
            description: "Returns a paginated list of past sessions ordered by most recent. Used to populate the Recent Sessions list on the Session Summary screen. Supports a limit param to fetch only the 3 most recent.",
            query_params: [
                {
                    name: "limit",
                    type: "integer",
                },
                {
                    name: "offset",
                    type: "integer",
                },
                {
                    name: "session_type_id",
                    type: "string",
                },
            ],
            response: {
                type: "array",
                schema_ref: "Session",
            },
            auth: "none",
        },
        {
            id: "save-session-note",
            method: "POST",
            path: "/api/sessions/{id}/note",
            description: "Creates or updates the note for a session. Called when the user blurs the note input or presses Enter on the Session Summary screen. Returns the saved note and triggers the Saved toast.",
            query_params: [
            ],
            response: {
                type: "object",
                schema_ref: "SessionNote",
            },
            auth: "none",
        },
    ],
};

export function generateDesignGenerateMock() {
    return Promise.resolve(Ok(spec));
}