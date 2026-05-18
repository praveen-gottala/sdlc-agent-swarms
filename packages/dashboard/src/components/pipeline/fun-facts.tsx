'use client';

import { useEffect, useState } from 'react';
import { Text, Box } from '@mantine/core';

const FACTS = [
  'The average software project has 15 dependencies that update weekly.',
  'Claude reads ~25,000 tokens per second — faster than any human code reviewer.',
  'The first bug was an actual moth found in a Harvard Mark II computer in 1947.',
  'The architecture stage evaluates 12+ technology options before picking one.',
  'TypeScript catches roughly 15% of JavaScript bugs at compile time.',
  'The reviewer runs deterministic gates before the LLM even looks at your code.',
  'Git was created by Linus Torvalds in just 10 days.',
  'The clarifier identifies an average of 8 requirement gaps per PRD.',
  'A well-written ADR saves ~4 hours of future debugging per decision.',
  'The implementer writes code in single-threaded mode to avoid merge conflicts.',
  'PostgreSQL has been actively developed for over 35 years.',
  'Each code review catches an average of 3.5 defects per 100 lines.',
];

interface FunFactsProps {
  startedAt: string;
  minWaitSeconds?: number;
}

export function FunFacts({
  startedAt,
  minWaitSeconds = 60,
}: FunFactsProps): React.JSX.Element | null {
  const [factIndex, setFactIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
    const delay = elapsed < minWaitSeconds ? (minWaitSeconds - elapsed) * 1000 : 0;
    const showTimer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(showTimer);
  }, [startedAt, minWaitSeconds]);

  useEffect(() => {
    if (!visible) return;
    const rotateTimer = setInterval(() => {
      setFactIndex((prev) => (prev + 1) % FACTS.length);
    }, 8_000);
    return () => clearInterval(rotateTimer);
  }, [visible]);

  if (!visible) return null;

  return (
    <Box
      style={{
        maxWidth: 360,
        textAlign: 'center',
        animation: 'fade-in 0.6s ease-out forwards',
      }}
    >
      <Text
        size="xs"
        c="var(--color-text-dim)"
        lh={1.5}
        key={factIndex}
        style={{ animation: 'fadeSlideUp 0.4s ease-out' }}
      >
        {FACTS[factIndex]}
      </Text>
    </Box>
  );
}
