import {
  IconSparkles,
  IconBolt,
  IconRocket,
  IconCircleCheck,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';

export interface SpineStage {
  readonly key: string;
  readonly label: string;
  readonly icon: Icon;
  readonly implemented: boolean;
  readonly color: string;
  readonly description: string;
}

export const SPINE_STAGES: readonly SpineStage[] = [
  { key: 'clarifier', label: 'Clarify', icon: IconSparkles, implemented: true, color: '#6366f1', description: 'Analyzing requirements and asking targeted questions' },
  { key: 'architect', label: 'Architect', icon: IconBolt, implemented: true, color: '#8b5cf6', description: 'Designing architecture, APIs, and task plan' },
  { key: 'implementer', label: 'Implement', icon: IconRocket, implemented: true, color: '#3b82f6', description: 'Generating code for each task' },
  { key: 'reviewer', label: 'Review', icon: IconCircleCheck, implemented: true, color: '#34d399', description: 'Running quality gates and code review' },
] as const;

export type SpineStageKey = 'clarifier' | 'architect' | 'implementer' | 'reviewer';
