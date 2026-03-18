# ADR-005: Channel Setup via Environment Variables

**Status:** Accepted
**Date:** 2026-03-18
**Context:** PRD v2.0 section 9.1.2 states that `agentforge init` should "connect" Slack/Telegram channels

## Problem

PRD section 9.1.2 describes the onboarding flow:

> **Connecting Slack... done**
> **Connecting Telegram... done**

This implies that `agentforge init` establishes live connections to messaging platforms. However, this requires:

1. Bot tokens (Slack Bot Token, Slack App Token, Telegram Bot Token)
2. Network calls to validate tokens
3. Potentially interactive OAuth flows (for Slack)

Asking for these tokens during a 3-minute quick-start wizard violates the PRD's goal of "5 questions, under 3 minutes."

## Decision

**`agentforge init` does NOT connect to channels.** It only:

1. Records channel preferences in `agentforge.yaml`
2. Creates a `.env.example` template with required environment variables
3. Prints setup instructions in the success message

**Actual channel connection happens at runtime** when `agentforge start <phase>` is invoked, using environment variables:

```bash
export AGENTFORGE_SLACK_BOT_TOKEN=xoxb-...
export AGENTFORGE_SLACK_APP_TOKEN=xapp-...
export AGENTFORGE_TELEGRAM_BOT_TOKEN=123456:ABC...
export ANTHROPIC_API_KEY=sk-ant-...
agentforge start design
```

## Consequences

### Positive
- Init remains fast (under 3 minutes)
- Tokens stored in `.env` (git-ignored), not in `agentforge.yaml` (committed)
- Users can defer channel setup until ready
- Standard 12-factor app pattern for config

### Negative
- PRD says "Connecting... done" but we don't actually connect
- Users must complete manual setup steps post-init
- No validation that tokens work until first `start` command

## Alternatives Considered

1. **Ask for tokens during init wizard** — violates 3-minute constraint, poor UX for credential entry in terminal
2. **`agentforge setup` command** — deferred to Phase 2, requires credential storage design
3. **OAuth redirect flow** — too complex for CLI, better suited for dashboard (Phase 2)

## Future Work

Phase 2 may add `agentforge setup slack` / `agentforge setup telegram` commands with interactive OAuth flows and secure credential storage.

## Related

- PRD v2.0 Section 9.1.2 (Onboarding Steps)
- PRD v2.0 Section 21.1 (First Run)
