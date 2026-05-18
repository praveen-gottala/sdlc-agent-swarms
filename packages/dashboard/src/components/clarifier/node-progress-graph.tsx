'use client';

import { Box, Group, Text, Tooltip } from '@mantine/core';

const NODES = [
  { key: 'contextRetriever', label: 'Context', description: 'Loading project context' },
  { key: 'prdAnalyzer', label: 'Analyze', description: 'Generating initial PRD' },
  { key: 'gapDetector', label: 'Gaps', description: 'Finding requirement gaps' },
  { key: 'questionPrioritizer', label: 'Prioritize', description: 'Ranking questions by value' },
  { key: 'storyWriter', label: 'Stories', description: 'Refining user stories' },
  { key: 'critic', label: 'Critic', description: 'Quality review pass' },
  { key: 'prdUpdater', label: 'Finalize', description: 'Updating final PRD' },
];

interface NodeProgressGraphProps {
  activeNode: string | null;
  completedNodes: ReadonlySet<string>;
}

export function NodeProgressGraph({
  activeNode,
  completedNodes,
}: NodeProgressGraphProps): React.JSX.Element {
  return (
    <Box
      style={{
        padding: '16px 24px',
        animation: 'fadeSlideUp 0.4s ease-out',
      }}
    >
      {/* Progress counter */}
      <Text size="xs" c="var(--color-text-dim)" ta="center" mb={12}>
        {completedNodes.size} of {NODES.length} steps
      </Text>

      {/* Node graph */}
      <Group gap={0} justify="center" wrap="nowrap">
        {NODES.map((node, i) => {
          const isActive = node.key === activeNode;
          const isComplete = completedNodes.has(node.key);
          const isPending = !isActive && !isComplete;

          return (
            <Group key={node.key} gap={0} wrap="nowrap" align="center">
              <Tooltip label={node.description} position="bottom" withArrow>
                <Box
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    padding: '0 6px',
                  }}
                >
                  <Box
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isActive
                        ? 'var(--color-spine-active)'
                        : isComplete
                          ? 'rgba(52, 211, 153, 0.15)'
                          : 'transparent',
                      border: isActive
                        ? 'none'
                        : isComplete
                          ? '1px solid rgba(52, 211, 153, 0.3)'
                          : '1px solid var(--color-border)',
                      boxShadow: isActive
                        ? '0 0 12px var(--color-spine-glow)'
                        : 'none',
                      animation: isActive
                        ? 'spine-glow 2s ease-in-out infinite'
                        : undefined,
                      transition: 'all 0.3s ease',
                    }}
                  >
                    {isComplete ? (
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none">
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
                    ) : (
                      <Text
                        size="xs"
                        fw={600}
                        c={isActive ? '#fff' : isPending ? 'var(--color-text-dim)' : 'var(--color-text-muted)'}
                      >
                        {i + 1}
                      </Text>
                    )}
                  </Box>
                  <Text
                    size="xs"
                    fw={isActive ? 600 : 400}
                    c={
                      isActive
                        ? 'var(--color-text-primary)'
                        : isComplete
                          ? 'var(--color-accent-emerald)'
                          : 'var(--color-text-dim)'
                    }
                    style={{ fontSize: 10, transition: 'all 0.3s ease' }}
                  >
                    {node.label}
                  </Text>
                </Box>
              </Tooltip>

              {/* Connector */}
              {i < NODES.length - 1 && (
                <Box
                  style={{
                    width: 16,
                    height: 2,
                    borderRadius: 1,
                    background: 'var(--color-border)',
                    position: 'relative',
                    overflow: 'hidden',
                    marginBottom: 18,
                  }}
                >
                  <Box
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      height: '100%',
                      width: isComplete ? '100%' : isActive ? '50%' : '0%',
                      background: isComplete
                        ? 'var(--color-accent-emerald)'
                        : 'var(--color-spine-active)',
                      borderRadius: 1,
                      transition: 'width 0.6s ease-out',
                      opacity: 0.6,
                    }}
                  />
                </Box>
              )}
            </Group>
          );
        })}
      </Group>
    </Box>
  );
}
