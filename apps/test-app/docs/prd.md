# Alpha Claim Filing UX Test Prototype PRD

## Document Control
- **Document Name:** Alpha Claim Filing UX Test Prototype PRD
- **Version:** v1.0
- **Status:** Draft
- **Owner:** Product / UX
- **Audience:** UX, Product, Design, Engineering, Research, Operations

---

## 1. Overview

This PRD defines a lightweight claim filing prototype inspired by Alpha-style step-based claim flows. The prototype is intended for **UX agent testing** and will spawn a **3-screen experience** to validate whether a simplified guided flow improves speed, clarity, and agent confidence during claim intake.

The prototype is not intended to replace production claim systems. It is designed to test usability, comprehension, and operational fit before deeper design or engineering investment.

---

## 2. Background

Claim filing experiences can create friction for agents when:
- information is collected across too many surfaces,
- some questions are repeated unnecessarily,
- blockers are not surfaced clearly,
- the system does not provide strong guidance on next steps,
- completion states are ambiguous.

An Alpha-like guided flow can reduce this friction by presenting a structured sequence with clear navigation, limited inputs, and a strong summary before completion.

---

## 3. Problem Statement

Agents need a simpler, more guided claim intake experience that helps them:
- collect only the minimum required information,
- understand eligibility or blocker states immediately,
- avoid redundant questioning,
- guide customers through next steps with confidence,
- complete or hand off the claim cleanly.

Without this, agents may spend extra time clarifying status, re-entering context, or navigating multiple systems.

---

## 4. Goal

Design and test a **3-screen claim filing prototype** that allows an agent to complete claim intake in a clear, structured sequence:

1. **Claim Context**
2. **Eligibility + Next Actions**
3. **Review + Submit / Handoff**

---

## 5. Objectives

### Primary Objective
Validate whether a 3-screen Alpha-style flow improves agent usability versus current claim setup behavior.

### Secondary Objectives
- Reduce confusion about system state and blockers
- Reduce redundant or repeated questions
- Improve confidence in next-step guidance
- Create a prototype suitable for moderated UX research sessions

---

## 6. Non-Goals

This prototype will not:
- perform live adjudication,
- complete real customer payment,
- connect to production claim systems,
- support all program or client variations,
- replicate every branch of the current claim flow,
- replace existing Alpha production workflows.

---

## 7. Target Users

### Primary User
**Claims agent / support expert** assisting a customer with filing a claim.

### Secondary Users
- UX researchers conducting moderated sessions
- Product managers validating workflow assumptions
- Designers evaluating screen architecture and information hierarchy

---

## 8. Success Metrics

The prototype will be considered successful if testing shows:

- **Task completion rate:** 90% or higher
- **Median completion time:** under 3 minutes
- **Ease-of-use rating:** 80% of agents rate it easier than the current experience
- **Critical usability failures:** 0 navigation-related blockers
- **Comprehension:** most agents can explain the next step without assistance

### Behavioral Metrics to Capture
- time on each screen
- back clicks
- next clicks
- field edits
- abandonment point
- blocker encounter rate
- submit vs handoff choice

---

## 9. Product Principles

The experience should be:

- **Guided:** clear sequencing and obvious next step
- **Compact:** only essential information shown
- **Stateful:** visible system status and blockers
- **Agent-friendly:** optimized for assisted service
- **Editable:** agents can go back and revise information
- **Low-friction:** minimal typing, structured inputs preferred

---

## 10. User Story

**As an agent**, I want a guided 3-screen claim filing flow so that I can complete intake quickly, avoid repeating work, and clearly understand what happens next for the customer.

---

## 11. End-to-End Experience

The prototype launches a 3-screen sequence:

### Screen 1: Claim Context
Capture the minimum claim details required to begin intake.

### Screen 2: Eligibility + Next Actions
Display eligibility and blocker status, with recommended next steps.

### Screen 3: Review + Submit / Handoff
Allow the agent to review the collected information and either submit, redirect, or save the claim state.

---

## 12. Functional Scope

### In Scope
- 3-screen desktop prototype
- guided navigation using Back and Next
- structured claim intake fields
- simulated eligibility/blocker logic
- summary and completion screen
- UX test instrumentation
- happy path and blocker scenarios

### Out of Scope
- real-time policy or billing integration
- live device checks
- production customer identity verification
- payment processing
- actual claim submission to a carrier or fulfillment partner

---

## 13. Detailed Screen Requirements

## 13.1 Screen 1 — Claim Context

### Purpose
Capture the minimum context needed to evaluate or continue a claim.

### Required Elements
- customer or device identifier
- claim / issue type
- incident date
- short claim details
- progress indicator
- Next button
- Back button (if entered from a prior state)

### Suggested Inputs
- **Issue Type**  
  - Lost / stolen / unrecoverable  
  - Malfunction  
  - Physical damage  
  - Replacement device issue

- **Incident Date**
- **Short Notes / Description**

### UX Requirements
- Use structured inputs where possible
- Keep typing minimal
- Clearly mark required fields
- Disable Next until required fields are complete

### Acceptance Criteria
- agents can complete this screen in under 60 seconds
- required fields are understandable without training
- at least one issue type is selected before continuing

---

## 13.2 Screen 2 — Eligibility + Next Actions

### Purpose
Show whether the claim can proceed and what the agent should do next.

### Required Elements
- eligibility state
- blocker state(s), if any
- recommended next action
- explanatory text
- Back and Next controls

### Eligibility States
- Eligible
- Needs more information
- Not eligible

### Blocker Examples
- payment pending
- FMIP / device prep required
- active or duplicate claim exists
- coverage mismatch
- unsupported incident state

### Recommended Next Actions
- Proceed
- Send payment link
- Guide customer to complete device prep
- Handoff / redirect
- Stop claim

### UX Requirements
- eligibility status should be readable in under 5 seconds
- blockers must be visually distinct
- action guidance should be explicit and operationally clear

### Acceptance Criteria
- agents can explain next steps after viewing the screen once
- blocker states do not require external interpretation
- agents can continue or redirect without confusion

---

## 13.3 Screen 3 — Review + Submit / Handoff

### Purpose
Provide a consolidated final review before completion.

### Required Elements
- summary of captured information
- editable confirmation of claim details
- final action buttons
- clear completion state

### Summary Content
- device/customer reference
- issue type
- incident date
- notes
- eligibility result
- blockers resolved or unresolved
- selected next action

### Completion Actions
- Submit claim
- Send to self-service continuation
- Redirect / handoff
- Save and resume later

### UX Requirements
- all critical information is visible in one place
- primary CTA is obvious
- completion state is unambiguous

### Acceptance Criteria
- agents can verify the claim quickly
- agents know whether the claim is complete, redirected, or paused
- submit or handoff action is completed with no ambiguity

---

## 14. Functional Requirements

### FR1. Three-Screen Flow
The application must present exactly **3 primary screens** in sequence for UX testing.

### FR2. Navigation
Each screen must support clear **Back** and **Next** navigation where appropriate.

### FR3. Structured Inputs
The prototype must support:
- radio buttons or checkboxes
- date picker
- short free-text input
- summary view

### FR4. Required Field Validation
The system must validate required fields before allowing progression.

### FR5. Prefill / Confirmation
Where data is already known, it should be prefilled or shown for confirmation rather than re-entered.

### FR6. Simulated System States
The prototype must support simulated states including:
- eligible
- blocked by payment
- blocked by device prep / FMIP
- ineligible / redirect

### FR7. Summary Screen
The final screen must consolidate the captured context and show the available completion path.

### FR8. Instrumentation
The prototype must log key research events:
- screen viewed
- time per screen
- field interaction
- validation errors
- back/next clicks
- final action selected

---

## 15. Non-Functional Requirements

- Desktop-first layout
- Prototype load under 1 second per screen in test environment
- Readable at standard support-center monitor sizes
- No production PII required
- Stable enough for moderated usability sessions
- Simple enough for design iteration between research rounds

---

## 16. UX Research Plan

### Primary Research Questions
1. Do agents understand the 3-step structure immediately?
2. Does the eligibility screen reduce uncertainty?
3. Are blockers easy to recognize and explain?
4. Which fields feel redundant or unnecessary?
5. Does the final summary improve confidence before completion?
6. Would agents prefer this to the current experience?

### Research Method
- Moderated usability sessions
- 5 to 8 agents in round 1
- Compare current behavior vs prototype behavior where possible
- Capture both task metrics and qualitative observations

### Core Tasks
- complete a standard damaged-device claim
- handle a payment-pending scenario
- handle a device-prep / FMIP blocker
- manage an ineligible or redirect outcome

---

## 17. Test Scenarios

### Scenario A — Standard Claim
Agent captures issue details, sees eligible status, reviews summary, and submits.

### Scenario B — Payment Pending
Agent sees payment blocker, triggers a payment-related next step, then proceeds once the blocker is considered resolved.

### Scenario C — Device Prep / FMIP Blocker
Agent sees preparation guidance and must communicate the required customer action before continuing.

### Scenario D — Ineligible / Redirect
Agent sees that the claim cannot proceed and selects the redirect or handoff path.

---

## 18. Dependencies

- UX design support for prototype screens
- content design for labels and helper text
- researcher to moderate sessions
- prototype platform or front-end shell for rendering 3 screens
- synthetic test data or mock claim profiles

---

## 19. Risks and Mitigations

### Risk 1: Flow is too simplified
**Mitigation:** include at least one blocker path and one redirect path

### Risk 2: Agents want more context than fits on 3 screens
**Mitigation:** note content gaps during testing and add progressive disclosure in later rounds

### Risk 3: Simulated states reduce realism
**Mitigation:** use realistic test scenarios and agent scripts

### Risk 4: Completion status remains unclear
**Mitigation:** add strong end-state messaging and explicit CTA labels

---

## 20. Open Questions

- Should screen 2 show all blockers together or only the highest-priority blocker?
- Should edits on screen 3 be inline or require navigation back?
- Should payment and device-prep actions be embedded or shown as external next steps?
- Is this prototype intended only for voice agents or also for chat-assisted service?
- Should “save and resume later” be in MVP or deferred?

---

## 21. MVP Recommendation

For the first UX round, build these paths only:
- one happy path,
- one payment-blocked path,
- one device-prep / FMIP blocked path,
- one ineligible / redirect path.

This is sufficient to validate the main hypotheses without reproducing the full production claim workflow.

---

## 22. Milestones

### Milestone 1 — PRD Approval
- align on scope
- confirm 3-screen architecture
- agree on test scenarios

### Milestone 2 — Prototype Design
- wireframes completed
- interaction design defined
- copy reviewed

### Milestone 3 — Usability Test Build
- clickable prototype ready
- instrumentation defined
- scenario scripts finalized

### Milestone 4 — Research Execution
- moderated sessions completed
- results documented
- design recommendations prepared

---

## 23. Sign-Off

### Required Reviewers
- Product Manager
- UX Designer
- UX Researcher
- Engineering Lead
- Operations / Agent Experience Stakeholder

### Approval Status
- Product: Pending
- UX: Pending
- Research: Pending
- Engineering: Pending
- Operations: Pending

---

## 24. Appendix: Suggested Screen Titles

- **Screen 1:** Start Claim
- **Screen 2:** Check Eligibility and Next Step
- **Screen 3:** Review and Complete
