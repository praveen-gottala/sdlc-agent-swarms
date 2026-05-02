'use client';

interface SuggestionCalloutProps {
  readonly text: string;
}

export function SuggestionCallout({ text }: SuggestionCalloutProps): React.JSX.Element {
  return (
    <div className="my-3 rounded-lg border-l-4 border-accent-orange bg-accent-orange/5 px-4 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-accent-orange">Suggestion</span>
      <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">{text}</p>
    </div>
  );
}
