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
}

export const SPINE_STAGES: readonly SpineStage[] = [
  { key: 'clarifier', label: 'Clarify', icon: IconSparkles, implemented: true },
  { key: 'architect', label: 'Architect', icon: IconBolt, implemented: true },
  { key: 'implementer', label: 'Implement', icon: IconRocket, implemented: true },
  { key: 'reviewer', label: 'Review', icon: IconCircleCheck, implemented: false },
] as const;

export type SpineStageKey = 'clarifier' | 'architect' | 'implementer' | 'reviewer';
