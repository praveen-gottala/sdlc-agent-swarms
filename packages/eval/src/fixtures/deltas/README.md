# Delta Fixtures

DesignSpecDelta fixtures for brownfield MODIFY testing and the Design Studio delta renderer.

## Source

- **cashpulse-recurring-badge.yaml** — Hand-crafted M3.6 delta (2026-05-16). Adds recurring frequency badge pills to dashboard expense rows 1 and 4. 159 -> 165 nodes.
- **cashpulse-add-recurring.yaml** — Hand-crafted M3.5 brownfield fixture. Adds recurrence configuration section to add-expense screen. 157 -> 191 nodes.
- **cashpulse-recurrence-toggle.yaml** — Hand-crafted M3.5 brownfield fixture. Adds toggle for recurrence on/off with frequency selector. Modifies existing form section.

## Target Base Spec

All fixtures target screens in the CashPulse personal expense tracker:
`fixtures/personal-expense-tracker/agentforge/designs/<screen>.json`

## Structure

```yaml
metadata:
  description: <what the delta does>
  targetPage: <screen ID matching the base spec filename>
  taskId: <eval scenario task ID>

delta:
  screenId: <must match targetPage>
  baseWidth: <viewport width, must match base spec>
  added: { <nodeId>: <NodeSpec>, ... }
  modified: { <nodeId>: <partial NodeSpec>, ... }
  removed: [<nodeId>, ...]
  reordered: [{ nodeId, newParent?, newOrder? }, ...]

highlightNodes:
  - nodeId: <id>
    op: added | modified | removed | reordered
    description: <human-readable>
```

## Usage

Load via `loadDeltaFixture(name)` from `packages/eval/src/fixtures/load-delta-fixture.ts`.
Apply to base spec via `deltaApply(baseSpec, delta)` from `@agentforge/designspec-renderer`.
