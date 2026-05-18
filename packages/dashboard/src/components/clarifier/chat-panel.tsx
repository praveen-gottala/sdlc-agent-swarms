'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage as ChatMessageType, PagePhase } from '@/lib/clarifier-chat-types';
import { WelcomeHero } from './welcome-hero';
import { ChatMessage } from './chat-message';
import { ChatInput } from './chat-input';

interface ChatPanelProps {
  readonly messages: readonly ChatMessageType[];
  readonly phase: PagePhase;
  readonly isRunning: boolean;
  readonly onSubmitSeed: (text: string, attachment?: { name: string; displayText?: string }) => void;
  readonly onSubmitAnswer?: (text: string) => void;
  readonly children?: React.ReactNode;
}

export function ChatPanel({
  messages,
  phase,
  isRunning,
  onSubmitSeed,
  onSubmitAnswer,
  children,
}: ChatPanelProps): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const showWelcome = phase === 'welcome' && messages.length === 0;

  useEffect(() => {
    if (phase === 'questions') return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, [messages.length, phase]);

  const handleSubmit = (text: string): void => {
    if (phase === 'welcome') {
      onSubmitSeed(text);
    } else if (onSubmitAnswer) {
      onSubmitAnswer(text);
    }
  };

  if (showWelcome) {
    return (
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        <WelcomeHero onSubmit={onSubmitSeed} isRunning={isRunning} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-bg-base">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-[640px] flex flex-col min-h-full justify-end">
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          {children}
          <div className="h-4 flex-shrink-0" />
        </div>
      </div>
      <ChatInput
        phase={phase}
        onSubmit={handleSubmit}
        disabled={isRunning}
      />
    </div>
  );
}
