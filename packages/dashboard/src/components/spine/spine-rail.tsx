'use client';

import { useEffect, useRef, useState } from 'react';
import { Group, Box, Text, Badge, Tooltip } from '@mantine/core';
import { SPINE_STAGES, type SpineStageKey } from './spine-constants';

interface SpineRailProps {
  activeStage: number;
  variant?: 'compact' | 'detailed';
  onStageClick?: (key: SpineStageKey) => void;
  pendingApprovals?: number;
  elapsedTime?: string;
}

function AnimatedCheckmark(): React.JSX.Element {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <path
        d="M5 13l4 4L19 7"
        stroke="var(--color-accent-emerald)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 24,
          strokeDashoffset: 0,
          animation: 'check-draw 0.4s ease-out forwards',
        }}
      />
    </svg>
  );
}

export function SpineRail({
  activeStage,
  variant = 'compact',
  onStageClick,
  pendingApprovals = 0,
  elapsedTime,
}: SpineRailProps): React.JSX.Element {
  const isDetailed = variant === 'detailed';
  const GATE_LABELS = ['Clarification gate', 'Design approval gate', 'Code review gate'];
  const prevStageRef = useRef(activeStage);
  const [flashIndex, setFlashIndex] = useState<number | null>(null);

  useEffect(() => {
    if (activeStage > prevStageRef.current && prevStageRef.current >= 0) {
      setFlashIndex(prevStageRef.current);
      const timer = setTimeout(() => setFlashIndex(null), 800);
      prevStageRef.current = activeStage;
      return () => clearTimeout(timer);
    }
    prevStageRef.current = activeStage;
  }, [activeStage]);

  return (
    <Group gap={0} justify="center" wrap="nowrap">
      {SPINE_STAGES.map((stage, i) => {
        const isActive = i === activeStage;
        const isPast = activeStage >= 0 && i < activeStage;
        const isFlashing = i === flashIndex;
        const Icon = stage.icon;
        const isClickable = isDetailed && onStageClick;

        return (
          <Group key={stage.key} gap={0} wrap="nowrap" align="center"
            style={{
              opacity: 0,
              animation: `fadeSlideUp 0.35s ease-out ${i * 0.08}s forwards`,
            }}
          >
            <Tooltip label={stage.description} position="bottom" withArrow disabled={!isDetailed}>
              <Box
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '0 20px',
                  cursor: isClickable ? 'pointer' : 'default',
                  animation: isFlashing ? 'stage-complete-flash 0.8s ease-out' : undefined,
                  borderRadius: 12,
                }}
                onClick={isClickable ? () => onStageClick(stage.key as SpineStageKey) : undefined}
              >
                <Box
                  className={isActive ? 'animate-spine-glow spine-active-pulse' : undefined}
                  style={{
                    width: 40, height: 40, borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isActive
                      ? `linear-gradient(135deg, ${stage.color}, ${stage.color}dd)`
                      : isPast
                        ? `${stage.color}18`
                        : 'transparent',
                    border: isActive
                      ? 'none'
                      : isPast
                        ? `1.5px solid ${stage.color}40`
                        : `1.5px solid var(--color-border)`,
                    boxShadow: isActive
                      ? `0 0 20px ${stage.color}40, 0 0 40px ${stage.color}15`
                      : 'none',
                    animation: isActive ? 'spine-glow 2s ease-in-out infinite' : undefined,
                    transition: 'all 0.4s ease',
                  }}
                >
                  {isPast ? (
                    <AnimatedCheckmark />
                  ) : (
                    <Icon
                      size={18}
                      stroke={1.5}
                      style={{
                        color: isActive ? '#fff' : isPast ? stage.color : 'var(--color-text-muted)',
                      }}
                    />
                  )}
                </Box>
                <Text
                  size="xs"
                  fw={isActive ? 700 : 400}
                  c={isActive ? 'var(--color-text-primary)' : isPast ? stage.color : 'var(--color-text-muted)'}
                  style={{ transition: 'all 0.3s ease' }}
                >
                  {stage.label}
                </Text>
                {isActive && elapsedTime && (
                  <Text size="xs" c="var(--color-text-muted)" ff="monospace" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {elapsedTime}
                  </Text>
                )}
                {isDetailed && !stage.implemented && (
                  <Badge size="xs" variant="light" color="gray" radius="sm">
                    Upcoming
                  </Badge>
                )}
              </Box>
            </Tooltip>

            {/* Connector line with fill animation */}
            {i < SPINE_STAGES.length - 1 && (
              <Box style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 0,
                marginBottom: isDetailed && !SPINE_STAGES[i + 1].implemented ? 40 : (isActive && elapsedTime) ? 42 : 22,
              }}>
                <Box style={{
                  width: 32, height: 2, borderRadius: 1,
                  background: 'var(--color-border)',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  <Box style={{
                    position: 'absolute',
                    top: 0, left: 0, height: '100%',
                    width: isPast ? '100%' : isActive ? '50%' : '0%',
                    background: isPast
                      ? `linear-gradient(90deg, ${stage.color}, ${SPINE_STAGES[i + 1].color})`
                      : stage.color,
                    borderRadius: 1,
                    transition: 'width 0.6s ease-out',
                    opacity: isPast ? 0.6 : 0.4,
                  }} />
                </Box>
                {/* HITL gate indicator */}
                {isDetailed && i < 3 && (
                  <Tooltip label={GATE_LABELS[i]} position="bottom" withArrow>
                    <Box
                      style={{
                        width: 8, height: 8, borderRadius: 2,
                        transform: 'rotate(45deg)',
                        marginTop: 6,
                        background: pendingApprovals > 0 && i === activeStage
                          ? 'var(--color-accent-amber)'
                          : isPast
                            ? `${stage.color}40`
                            : 'var(--color-border)',
                        animation: pendingApprovals > 0 && i === activeStage
                          ? 'pulse-dot 1s ease-in-out infinite'
                          : undefined,
                        transition: 'background 0.3s ease',
                      }}
                    />
                  </Tooltip>
                )}
              </Box>
            )}
          </Group>
        );
      })}
    </Group>
  );
}
