'use client';

import { Group, Box, Text, Badge } from '@mantine/core';
import { SPINE_STAGES, type SpineStageKey } from './spine-constants';

interface SpineRailProps {
  activeStage: number;
  variant?: 'compact' | 'detailed';
  onStageClick?: (key: SpineStageKey) => void;
  pendingApprovals?: number;
}

export function SpineRail({
  activeStage,
  variant = 'compact',
  onStageClick,
  pendingApprovals = 0,
}: SpineRailProps): React.JSX.Element {
  const isDetailed = variant === 'detailed';

  return (
    <Group gap={0} justify="center" wrap="nowrap">
      {SPINE_STAGES.map((stage, i) => {
        const isActive = i === activeStage;
        const isPast = activeStage >= 0 && i < activeStage;
        const Icon = stage.icon;
        const isClickable = isDetailed && onStageClick;

        return (
          <Group key={stage.key} gap={0} wrap="nowrap" align="center">
            <Box
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '0 20px',
                cursor: isClickable ? 'pointer' : 'default',
              }}
              onClick={isClickable ? () => onStageClick(stage.key as SpineStageKey) : undefined}
            >
              <Box style={{
                width: 40, height: 40, borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive
                  ? 'var(--color-accent-blue)'
                  : isPast
                    ? 'var(--color-bg-elevated)'
                    : 'transparent',
                border: isActive
                  ? 'none'
                  : `1.5px solid ${isPast ? 'var(--color-text-muted)' : 'var(--color-border)'}`,
                transition: 'all 0.2s ease',
              }}>
                <Icon
                  size={18}
                  stroke={1.5}
                  style={{
                    color: isActive ? '#fff' : isPast ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
                  }}
                />
              </Box>
              <Text size="xs" fw={isActive ? 600 : 400}
                c={isActive ? 'var(--color-text-primary)' : 'var(--color-text-muted)'}>
                {stage.label}
              </Text>
              {isDetailed && !stage.implemented && (
                <Badge size="xs" variant="light" color="gray" radius="sm">
                  Upcoming
                </Badge>
              )}
            </Box>

            {/* Connector line */}
            {i < SPINE_STAGES.length - 1 && (
              <Box style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 0,
                marginBottom: isDetailed && !SPINE_STAGES[i + 1].implemented ? 40 : 22,
              }}>
                <Box style={{
                  width: 32, height: 1.5,
                  background: isPast ? 'var(--color-text-muted)' : 'var(--color-border)',
                }} />
                {/* HITL gate indicator between stages */}
                {isDetailed && i < 3 && (
                  <Box
                    style={{
                      width: 8, height: 8, borderRadius: 2,
                      transform: 'rotate(45deg)',
                      marginTop: 6,
                      background: pendingApprovals > 0 && i === activeStage
                        ? 'var(--color-accent-orange)'
                        : 'var(--color-border)',
                      transition: 'background 0.2s ease',
                    }}
                    title={['Clarification gate', 'Design approval gate', 'Code review gate'][i]}
                  />
                )}
              </Box>
            )}
          </Group>
        );
      })}
    </Group>
  );
}
