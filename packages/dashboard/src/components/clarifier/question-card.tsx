'use client';

import { useState } from 'react';

interface Question {
  readonly id: string;
  readonly gapId: string;
  readonly text: string;
  readonly type: 'open' | 'multiple-choice';
  readonly options?: readonly string[];
  readonly priority: number;
  readonly evpiScore: number;
}

interface QuestionCardProps {
  question: Question;
  index: number;
  value: string;
  onAnswer: (questionId: string, answer: string, selectedOption?: string) => void;
  disabled?: boolean;
}

export function QuestionCard({ question, index, value, onAnswer, disabled }: QuestionCardProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [customText, setCustomText] = useState('');

  const handleOptionSelect = (option: string) => {
    if (disabled) return;
    setSelectedOption(option);
    onAnswer(question.id, option, option);
  };

  const handleTextChange = (text: string) => {
    setCustomText(text);
    onAnswer(question.id, text);
  };

  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-4 transition-all duration-200 hover:border-text-muted/30">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-blue/15 text-xs font-medium text-accent-blue">
            {index + 1}
          </span>
          <p className="text-sm font-medium text-text-primary">{question.text}</p>
        </div>
        {question.evpiScore >= 0.5 && (
          <span className="shrink-0 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-medium text-orange-400">
            High impact
          </span>
        )}
      </div>

      {question.type === 'multiple-choice' && question.options ? (
        <div className="ml-8 space-y-2">
          {question.options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => handleOptionSelect(option)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                selectedOption === option || value === option
                  ? 'bg-accent-blue/15 text-accent-blue ring-1 ring-accent-blue/30'
                  : 'bg-bg-card text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
              } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  selectedOption === option || value === option
                    ? 'border-accent-blue bg-accent-blue'
                    : 'border-text-muted'
                }`}
              >
                {(selectedOption === option || value === option) && (
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                )}
              </span>
              {option}
            </button>
          ))}
        </div>
      ) : (
        <div className="ml-8">
          <textarea
            value={customText || value}
            onChange={(e) => handleTextChange(e.target.value)}
            disabled={disabled}
            placeholder="Type your answer..."
            rows={2}
            className="w-full resize-none rounded-md border border-border bg-bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-ring transition-colors disabled:opacity-50"
          />
        </div>
      )}
    </div>
  );
}
