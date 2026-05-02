'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage as ChatMessageType } from '@/lib/clarifier-chat-types';
import { ChatMessage } from './chat-message';

interface ChatThreadProps {
  readonly messages: readonly ChatMessageType[];
}

export function ChatThread({ messages }: ChatThreadProps): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-[640px] flex flex-col min-h-full justify-end">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
      </div>
    </div>
  );
}
