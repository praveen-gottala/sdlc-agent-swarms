---
paths: ["packages/orchestrator/**/*.py"]
---

# Python Orchestrator Rules

- All agents MUST inherit from `BaseAgent` and implement the agent contract interface.
- Use typed event payloads defined in `config/event_registry.yaml` — never emit untyped dicts.
- Every LangGraph node function must have try/except with typed error responses.
- State mutations go through the state manager — never modify state dicts directly.
- Use Pydantic models for all data validation (agent inputs, outputs, event payloads).
- Import order: stdlib → third-party → local, separated by blank lines.
- Docstrings: Google style, required on all public methods.
- Type hints required on all function signatures.
- No `print()` — use the structured logger.
- Agent prompts live in `packages/orchestrator/prompts/` as markdown files, not inline strings.
