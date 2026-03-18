"""Pydantic models mirroring TypeScript types for YAML interop.

These models match the canonical definitions in packages/core/src/types/
so that Python can read and write the same YAML files as the TS runtime.
"""

from __future__ import annotations

import time
from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums / Literal unions
# ---------------------------------------------------------------------------

TaskStatus = Literal[
    "pending",
    "in_progress",
    "awaiting_approval",
    "approved",
    "changes_requested",
    "completed",
    "failed",
    "paused",
]

SDLCPhase = Literal["design", "spec", "code", "cicd", "observe"]

HITLLevel = Literal[
    "full_approval",
    "review_and_override",
    "notify_only",
    "fully_autonomous",
]

HITLDecision = Literal["approved", "rejected", "changes_requested"]

ChannelType = Literal["slack", "telegram", "cli"]

DeployEnvironment = Literal["staging", "production"]

SpecDriftSeverity = Literal["minor", "significant"]

BudgetSeverity = Literal["warning", "hard_stop"]

# ---------------------------------------------------------------------------
# Task models  (agentforge.tasks.yaml)
# ---------------------------------------------------------------------------


class TaskEntry(BaseModel, frozen=True):
    """A single task entry in agentforge.tasks.yaml."""

    id: str
    title: str
    phase: str
    agent: str
    status: TaskStatus
    depends_on: list[str] = Field(default_factory=list)
    spec_ref: str
    branch: str | None = None
    pr_number: int | None = None
    cost_usd: float = 0.0
    tokens_used: int = 0
    attempts: int = 0
    max_attempts: int = 3
    hitl_status: str = ""
    hitl_channel: str | None = None


class TasksFile(BaseModel, frozen=True):
    """The full agentforge.tasks.yaml file."""

    tasks: list[TaskEntry] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Project manifest models  (agentforge.yaml)
# ---------------------------------------------------------------------------


class StackConfig(BaseModel, frozen=True):
    """Stack configuration for the project."""

    frontend: str
    backend: str
    database: str
    styling: str


class RepoConfig(BaseModel, frozen=True):
    """Repository configuration."""

    provider: str
    org: str
    name: str


class ProviderConfig(BaseModel, frozen=True):
    """Agent provider overrides per role."""

    default: str
    overrides: dict[str, str] | None = None


class SandboxConfig(BaseModel, frozen=True):
    """Sandbox configuration for agent-generated code execution."""

    type: str
    timeout_minutes: int
    max_retries: int


class OrchestrationConfig(BaseModel, frozen=True):
    """Orchestration settings."""

    max_concurrent_agents: int
    ci_wait_strategy: str


class HITLManifestConfig(BaseModel, frozen=True):
    """HITL section in the project manifest."""

    default: HITLLevel
    overrides: dict[str, HITLLevel] | None = None


class ChannelEntry(BaseModel, frozen=True):
    """Channel entry in the project manifest."""

    type: ChannelType
    capabilities: Literal["full", "approvals", "basic"]
    priority: int


class RoutingManifestConfig(BaseModel, frozen=True):
    """Channel routing configuration."""

    approval_requests: Literal["all", "primary"]
    status_updates: Literal["all", "primary"]
    critical_alerts: Literal["all"]


class BudgetManifestConfig(BaseModel, frozen=True):
    """Budget configuration in the manifest."""

    per_task_max_usd: float
    per_phase_max_usd: float
    monthly_max_usd: float
    alert_threshold: float


class ProjectConfig(BaseModel, frozen=True):
    """The project section of the manifest."""

    name: str
    id: str
    description: str | None = None
    platforms: list[str] = Field(default_factory=list)


class AgentsConfig(BaseModel, frozen=True):
    """Agents section of the manifest."""

    providers: ProviderConfig
    sandbox: SandboxConfig
    orchestration: OrchestrationConfig


class ProjectManifest(BaseModel, frozen=True):
    """The full agentforge.yaml project manifest."""

    version: str
    project: ProjectConfig
    stack: StackConfig
    repo: RepoConfig
    agents: AgentsConfig
    hitl: HITLManifestConfig
    channels: list[ChannelEntry] = Field(default_factory=list)
    routing: RoutingManifestConfig
    budget: BudgetManifestConfig


# ---------------------------------------------------------------------------
# Domain event models  (28 event types matching TS DomainEvent union)
# ---------------------------------------------------------------------------


class AgentStarted(BaseModel, frozen=True):
    type: Literal["AgentStarted"] = "AgentStarted"
    agentId: str
    taskId: str
    timestamp: float = Field(default_factory=time.time)


class AgentCompleted(BaseModel, frozen=True):
    type: Literal["AgentCompleted"] = "AgentCompleted"
    agentId: str
    taskId: str
    timestamp: float = Field(default_factory=time.time)


class AgentFailed(BaseModel, frozen=True):
    type: Literal["AgentFailed"] = "AgentFailed"
    agentId: str
    taskId: str
    error: str
    timestamp: float = Field(default_factory=time.time)


class TaskStatusChanged(BaseModel, frozen=True):
    type: Literal["TaskStatusChanged"] = "TaskStatusChanged"
    taskId: str
    to: str
    timestamp: float = Field(default_factory=time.time)
    # TS field name is 'from' which is a Python keyword; alias it.
    from_status: str = Field(alias="from", default="")

    model_config = {"populate_by_name": True}


class BudgetAlert(BaseModel, frozen=True):
    type: Literal["BudgetAlert"] = "BudgetAlert"
    level: str
    entityId: str
    currentSpendUsd: float
    limitUsd: float
    severity: BudgetSeverity
    timestamp: float = Field(default_factory=time.time)


class HITLApprovalRequested(BaseModel, frozen=True):
    type: Literal["HITLApprovalRequested"] = "HITLApprovalRequested"
    gateId: str
    agentId: str
    taskId: str
    timestamp: float = Field(default_factory=time.time)


class HITLApprovalReceived(BaseModel, frozen=True):
    type: Literal["HITLApprovalReceived"] = "HITLApprovalReceived"
    gateId: str
    decision: str
    decidedBy: str | None = None
    timestamp: float = Field(default_factory=time.time)


class SpecLockAcquired(BaseModel, frozen=True):
    type: Literal["SpecLockAcquired"] = "SpecLockAcquired"
    filePath: str
    agentId: str
    timestamp: float = Field(default_factory=time.time)


class SpecLockReleased(BaseModel, frozen=True):
    type: Literal["SpecLockReleased"] = "SpecLockReleased"
    filePath: str
    agentId: str
    timestamp: float = Field(default_factory=time.time)


class PRMerged(BaseModel, frozen=True):
    type: Literal["PRMerged"] = "PRMerged"
    prNumber: int
    branch: str
    mergedBy: str
    timestamp: float = Field(default_factory=time.time)


class SpecDriftDetected(BaseModel, frozen=True):
    type: Literal["SpecDriftDetected"] = "SpecDriftDetected"
    specFile: str
    deviations: list[str] = Field(default_factory=list)
    severity: SpecDriftSeverity
    timestamp: float = Field(default_factory=time.time)


class PageRequested(BaseModel, frozen=True):
    type: Literal["PageRequested"] = "PageRequested"
    pageId: str
    taskId: str
    description: str
    timestamp: float = Field(default_factory=time.time)


class UXResearchComplete(BaseModel, frozen=True):
    type: Literal["UXResearchComplete"] = "UXResearchComplete"
    pageId: str
    taskId: str
    layoutSuggestions: list[str] = Field(default_factory=list)
    timestamp: float = Field(default_factory=time.time)


class WireframeComplete(BaseModel, frozen=True):
    type: Literal["WireframeComplete"] = "WireframeComplete"
    pageId: str
    taskId: str
    designRef: str
    timestamp: float = Field(default_factory=time.time)


class WireframeApproved(BaseModel, frozen=True):
    type: Literal["WireframeApproved"] = "WireframeApproved"
    pageId: str
    taskId: str
    designRef: str
    timestamp: float = Field(default_factory=time.time)


class VisualDesignComplete(BaseModel, frozen=True):
    type: Literal["VisualDesignComplete"] = "VisualDesignComplete"
    pageId: str
    taskId: str
    designRef: str
    timestamp: float = Field(default_factory=time.time)


class DesignReviewComplete(BaseModel, frozen=True):
    type: Literal["DesignReviewComplete"] = "DesignReviewComplete"
    pageId: str
    taskId: str
    passed: bool
    issues: list[str] = Field(default_factory=list)
    timestamp: float = Field(default_factory=time.time)


class DesignPhaseComplete(BaseModel, frozen=True):
    type: Literal["DesignPhaseComplete"] = "DesignPhaseComplete"
    specRef: str
    designRef: str
    timestamp: float = Field(default_factory=time.time)


class SpecComplete(BaseModel, frozen=True):
    type: Literal["SpecComplete"] = "SpecComplete"
    specRef: str
    taskId: str
    timestamp: float = Field(default_factory=time.time)


class TasksCreated(BaseModel, frozen=True):
    type: Literal["TasksCreated"] = "TasksCreated"
    taskCount: int
    taskIds: list[str] = Field(default_factory=list)
    timestamp: float = Field(default_factory=time.time)


class CodeGenComplete(BaseModel, frozen=True):
    type: Literal["CodeGenComplete"] = "CodeGenComplete"
    taskId: str
    agentId: str
    branch: str
    filesGenerated: list[str] = Field(default_factory=list)
    timestamp: float = Field(default_factory=time.time)


class TestsComplete(BaseModel, frozen=True):
    type: Literal["TestsComplete"] = "TestsComplete"
    taskId: str
    agentId: str
    branch: str
    testFilesGenerated: list[str] = Field(default_factory=list)
    timestamp: float = Field(default_factory=time.time)


class PRCreated(BaseModel, frozen=True):
    type: Literal["PRCreated"] = "PRCreated"
    taskId: str
    prNumber: int
    branch: str
    timestamp: float = Field(default_factory=time.time)


class ReviewComplete(BaseModel, frozen=True):
    type: Literal["ReviewComplete"] = "ReviewComplete"
    taskId: str
    agentId: str
    prNumber: int
    decision: str
    timestamp: float = Field(default_factory=time.time)


class CIFailed(BaseModel, frozen=True):
    type: Literal["CIFailed"] = "CIFailed"
    taskId: str
    branch: str
    runId: str
    logs: str
    timestamp: float = Field(default_factory=time.time)


class SecurityScanComplete(BaseModel, frozen=True):
    type: Literal["SecurityScanComplete"] = "SecurityScanComplete"
    taskId: str
    prNumber: int
    findingsCount: int
    criticalCount: int
    passed: bool
    timestamp: float = Field(default_factory=time.time)


class BuildFixComplete(BaseModel, frozen=True):
    type: Literal["BuildFixComplete"] = "BuildFixComplete"
    taskId: str
    branch: str
    fixApplied: bool
    timestamp: float = Field(default_factory=time.time)


class DeployComplete(BaseModel, frozen=True):
    type: Literal["DeployComplete"] = "DeployComplete"
    taskId: str
    environment: DeployEnvironment
    healthy: bool
    timestamp: float = Field(default_factory=time.time)


class DeployFailed(BaseModel, frozen=True):
    type: Literal["DeployFailed"] = "DeployFailed"
    taskId: str
    environment: DeployEnvironment
    reason: str
    timestamp: float = Field(default_factory=time.time)


class PhaseStarted(BaseModel, frozen=True):
    type: Literal["PhaseStarted"] = "PhaseStarted"
    phase: str
    timestamp: float = Field(default_factory=time.time)


class PhaseComplete(BaseModel, frozen=True):
    type: Literal["PhaseComplete"] = "PhaseComplete"
    phase: str
    timestamp: float = Field(default_factory=time.time)


# Discriminated union of all domain events.
DomainEvent = (
    AgentStarted
    | AgentCompleted
    | AgentFailed
    | TaskStatusChanged
    | BudgetAlert
    | HITLApprovalRequested
    | HITLApprovalReceived
    | SpecLockAcquired
    | SpecLockReleased
    | PRMerged
    | SpecDriftDetected
    | PageRequested
    | UXResearchComplete
    | WireframeComplete
    | WireframeApproved
    | VisualDesignComplete
    | DesignReviewComplete
    | DesignPhaseComplete
    | SpecComplete
    | TasksCreated
    | CodeGenComplete
    | TestsComplete
    | PRCreated
    | ReviewComplete
    | CIFailed
    | SecurityScanComplete
    | BuildFixComplete
    | DeployComplete
    | DeployFailed
    | PhaseStarted
    | PhaseComplete
)

DomainEventType = Literal[
    "AgentStarted",
    "AgentCompleted",
    "AgentFailed",
    "TaskStatusChanged",
    "BudgetAlert",
    "HITLApprovalRequested",
    "HITLApprovalReceived",
    "SpecLockAcquired",
    "SpecLockReleased",
    "PRMerged",
    "SpecDriftDetected",
    "PageRequested",
    "UXResearchComplete",
    "WireframeComplete",
    "WireframeApproved",
    "VisualDesignComplete",
    "DesignReviewComplete",
    "DesignPhaseComplete",
    "SpecComplete",
    "TasksCreated",
    "CodeGenComplete",
    "TestsComplete",
    "PRCreated",
    "ReviewComplete",
    "CIFailed",
    "SecurityScanComplete",
    "BuildFixComplete",
    "DeployComplete",
    "DeployFailed",
    "PhaseStarted",
    "PhaseComplete",
]
