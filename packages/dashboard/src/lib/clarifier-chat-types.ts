/**
 * @module clarifier-chat-types
 *
 * Discriminated union for chat thread messages in the clarifier UI.
 * These are UI-only types — not cross-agent artifacts.
 */

export interface StructuredOption {
  readonly label: string;
  readonly description: string;
  readonly rationale?: string;
  readonly tradeoffs?: readonly string[];
  readonly recommended: boolean;
  readonly source: 'llm' | 'codebase' | 'template' | 'catalog';
  readonly citation?: string;
}

export interface Question {
  readonly id: string;
  readonly gapId: string;
  readonly topic?: string;
  readonly text: string;
  readonly type: 'open' | 'multiple-choice';
  readonly options?: readonly StructuredOption[];
  readonly priority: number;
  readonly evpiScore: number;
}

export interface AssumptionEntry {
  readonly id: string;
  readonly statement: string;
  readonly evidence: string;
  readonly confidence: number;
  readonly blastRadius: string;
  readonly requiresConfirmation: boolean;
}

export interface Gap {
  readonly id: string;
  readonly topic?: string;
  readonly description: string;
  readonly category: 'missing' | 'ambiguous' | 'conflicting' | 'incomplete';
  readonly confidence: number;
  readonly deterministic: boolean;
  readonly divergentInterpretations?: readonly StructuredOption[];
  readonly divergenceScore?: number;
}

/* ------------------------------------------------------------------ */
/*  Chat message kinds                                                 */
/* ------------------------------------------------------------------ */

interface UserSeedMessage {
  readonly kind: 'user-seed';
  readonly text: string;
}

export interface ToolResultMessage {
  readonly kind: 'tool-result';
  readonly node: string;
  readonly label: string;
  readonly summary: string;
  readonly status: 'completed' | 'running' | 'error';
  readonly details?: Record<string, unknown>;
}

interface AgentThinkingMessage {
  readonly kind: 'agent-thinking';
  readonly stage: string;
  readonly label: string;
  readonly index: number;
  readonly total: number;
}

interface AgentQuestionMessage {
  readonly kind: 'agent-question';
  readonly questions: readonly Question[];
  readonly round: number;
  readonly maxRounds: number;
}

interface UserAnswerMessage {
  readonly kind: 'user-answer';
  readonly questionId: string;
  readonly questionText: string;
  readonly answer: string;
  readonly selectedOption?: string;
}

interface PrdUpdateMessage {
  readonly kind: 'prd-update';
  readonly featureCount: number;
  readonly personaCount: number;
  readonly screenCount: number;
  readonly nfrCount: number;
}

interface EscalationMessage {
  readonly kind: 'escalation';
  readonly round: number;
  readonly maxRounds: number;
}

interface ErrorMessage {
  readonly kind: 'error';
  readonly message: string;
}

interface PrdCompleteMessage {
  readonly kind: 'prd-complete';
  readonly confidence: number;
  readonly featureCount: number;
  readonly assumptionCount: number;
}

export type ChatMessagePayload =
  | UserSeedMessage
  | ToolResultMessage
  | AgentThinkingMessage
  | AgentQuestionMessage
  | UserAnswerMessage
  | PrdUpdateMessage
  | EscalationMessage
  | ErrorMessage
  | PrdCompleteMessage;

export interface ChatMessage {
  readonly id: string;
  readonly timestamp: number;
  readonly payload: ChatMessagePayload;
}

/* ------------------------------------------------------------------ */
/*  Clarifier state shape for the dashboard                            */
/* ------------------------------------------------------------------ */

export interface ClarifierState {
  mode: string;
  round: number;
  maxRounds: number;
  questions: Question[];
  gaps: Gap[];
  requirement: { prd: Record<string, unknown>; confidence: number } | null;
  assumptions: { entries: AssumptionEntry[] } | null;
  prdDraft: Record<string, unknown> | null;
  featurePlan: Record<string, unknown> | null;
  error: string | null;
}

export interface ClarifierResponse {
  threadId: string;
  interrupted: boolean;
  state: ClarifierState;
}

export type PagePhase = 'welcome' | 'running' | 'questions' | 'escalation' | 'complete' | 'error';

/** SSE event types emitted by the clarifier API route. */
export type ClarifierSSEEventType =
  | 'stage'
  | 'node-complete'
  | 'prd-draft'
  | 'gaps'
  | 'error'
  | 'result';

export interface StageEvent {
  stage: string;
  label: string;
  index: number;
  total: number;
}
