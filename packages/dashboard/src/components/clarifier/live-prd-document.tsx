'use client';

import { useMemo } from 'react';
import type { Gap, AssumptionEntry } from '@/lib/clarifier-chat-types';
import { PrdSection } from './prd-section';
import { SuggestionCallout } from './suggestion-callout';
import { OpenQuestionsSection } from './open-questions-section';

interface LivePrdDocumentProps {
  readonly prdDraft: Record<string, unknown>;
  readonly gaps?: readonly Gap[];
  readonly assumptions?: { readonly entries: readonly AssumptionEntry[] } | null;
  readonly confidence?: number;
}

const PRIORITY_COLORS: Record<string, string> = {
  'must-have': 'bg-red-500/10 text-red-400 border-red-500/20',
  'should-have': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'could-have': 'bg-green-500/10 text-green-400 border-green-500/20',
  'wont-have': 'bg-text-muted/10 text-text-muted border-border/40',
};

type SectionKey = 'overview' | 'features' | 'personas' | 'dataModel' | 'screens' | 'nfrs' | 'successMetrics' | 'outOfScope' | 'openQuestions' | 'assumptions';

interface FeatureItem { id: string; name: string; description: string; priority?: string }
interface PersonaItem { id: string; name: string; role: string; goals?: string[] }
interface DataEntityItem { id: string; name: string; fields?: { name: string; type: string; required?: boolean }[] }
interface ScreenItem { id: string; name: string; description: string; screenType?: string }
interface NfrItem { id: string; category: string; description: string; target?: string }
interface MetricItem { id: string; name: string; description: string; target: string; measurement: string }

export function LivePrdDocument({ prdDraft, gaps, assumptions, confidence }: LivePrdDocumentProps): React.JSX.Element {
  const features = (prdDraft.features ?? []) as FeatureItem[];
  const personas = (prdDraft.personas ?? []) as PersonaItem[];
  const dataEntities = (prdDraft.dataEntities ?? []) as DataEntityItem[];
  const screens = (prdDraft.screens ?? []) as ScreenItem[];
  const nfrs = (prdDraft.nfrs ?? []) as NfrItem[];
  const successMetrics = (prdDraft.successMetrics ?? []) as MetricItem[];
  const outOfScope = (prdDraft.outOfScope ?? []) as string[];
  const description = prdDraft.description as string | undefined;

  const confirmableAssumptions = assumptions?.entries?.filter((a) => a.requiresConfirmation) ?? [];
  const incompleteGaps = gaps?.filter((g) => g.category === 'incomplete') ?? [];

  const sectionDelays = useMemo(() => {
    const present: SectionKey[] = [];
    if (description) present.push('overview');
    if (features.length > 0) present.push('features');
    if (personas.length > 0) present.push('personas');
    if (dataEntities.length > 0) present.push('dataModel');
    if (screens.length > 0) present.push('screens');
    if (nfrs.length > 0) present.push('nfrs');
    if (successMetrics.length > 0) present.push('successMetrics');
    if (outOfScope.length > 0) present.push('outOfScope');
    if (gaps && gaps.length > 0) present.push('openQuestions');
    if (assumptions && assumptions.entries.length > 0) present.push('assumptions');

    const delays: Record<string, number> = {};
    present.forEach((key, i) => { delays[key] = (i + 1) * 100; });
    return delays;
  }, [description, features.length, personas.length, dataEntities.length, screens.length, nfrs.length, successMetrics.length, outOfScope.length, gaps, assumptions]);

  return (
    <div className="space-y-1">
      {/* Quality scoring strip */}
      {confidence !== undefined && (
        <div className="flex items-center gap-3 mb-5 px-1 animate-[fadeSlideUp_0.3s_ease-out]">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-text-muted uppercase tracking-wide">Sections</span>
            {[
              { label: 'Features', count: features.length },
              { label: 'Personas', count: personas.length },
              { label: 'Screens', count: screens.length },
              { label: 'NFRs', count: nfrs.length },
            ].map(({ label, count }) => (
              <span key={label} className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                count > 0 ? 'bg-green-500/10 text-green-400' : 'bg-text-muted/10 text-text-muted'
              }`}>
                {label}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Overview */}
      {description && (
        <PrdSection title="Overview" animationDelay={sectionDelays.overview}>
          <p className="text-[14px] leading-[1.7] text-text-secondary">{description}</p>
        </PrdSection>
      )}

      {/* Suggestions from confirmable assumptions */}
      {confirmableAssumptions.length > 0 && (
        <SuggestionCallout
          text={`${confirmableAssumptions.length} assumption${confirmableAssumptions.length === 1 ? '' : 's'} need${confirmableAssumptions.length === 1 ? 's' : ''} confirmation: ${confirmableAssumptions[0].statement}`}
        />
      )}

      {/* Features */}
      {features.length > 0 && (
        <PrdSection title="Features" count={features.length} animationDelay={sectionDelays.features}>
          <div className="space-y-2">
            {features.map((f) => (
              <div key={f.id} className="rounded-md border border-border/30 bg-bg-elevated/50 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-text-primary">{f.name}</span>
                  {f.priority && (
                    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_COLORS[f.priority] ?? ''}`}>
                      {f.priority}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">{f.description}</p>
              </div>
            ))}
          </div>
        </PrdSection>
      )}

      {/* Suggestion for incomplete sections */}
      {incompleteGaps.length > 0 && (
        <SuggestionCallout
          text={`This section could benefit from more detail: ${incompleteGaps[0].description}`}
        />
      )}

      {/* Personas */}
      {personas.length > 0 && (
        <PrdSection title="Personas" count={personas.length} animationDelay={sectionDelays.personas}>
          <div className="space-y-2">
            {personas.map((p) => (
              <div key={p.id} className="py-1.5">
                <span className="text-[13px] font-medium text-text-primary">{p.name}</span>
                <span className="mx-1.5 text-text-muted/30">·</span>
                <span className="text-[12px] text-text-secondary">{p.role}</span>
                {p.goals && p.goals.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {p.goals.map((g, i) => (
                      <li key={i} className="text-[12px] text-text-muted flex items-start gap-1.5">
                        <span className="text-text-muted/30 mt-1">•</span>
                        {g}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </PrdSection>
      )}

      {/* Data Model */}
      {dataEntities.length > 0 && (
        <PrdSection title="Data Model" count={dataEntities.length} animationDelay={sectionDelays.dataModel}>
          <div className="space-y-2">
            {dataEntities.map((e) => (
              <div key={e.id} className="rounded-md border border-border/30 bg-bg-elevated/50 px-3 py-2.5">
                <span className="text-[13px] font-medium text-text-primary">{e.name}</span>
                {e.fields && e.fields.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {e.fields.map((f) => (
                      <div key={f.name} className="flex items-center gap-2 text-[11px]">
                        <span className="font-mono text-accent-blue">{f.name}</span>
                        <span className="text-text-muted">{f.type}</span>
                        {f.required && <span className="text-red-400/70 text-[9px]">required</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </PrdSection>
      )}

      {/* Screens */}
      {screens.length > 0 && (
        <PrdSection title="Screens" count={screens.length} animationDelay={sectionDelays.screens}>
          <div className="space-y-1.5">
            {screens.map((s) => (
              <div key={s.id} className="flex items-start gap-2 py-1">
                <span className="text-[13px] font-medium text-text-primary">{s.name}</span>
                {s.screenType && (
                  <span className="rounded-md bg-accent-purple/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-purple">
                    {s.screenType}
                  </span>
                )}
                <span className="text-[12px] text-text-secondary flex-1">{s.description}</span>
              </div>
            ))}
          </div>
        </PrdSection>
      )}

      {/* NFRs */}
      {nfrs.length > 0 && (
        <PrdSection title="Non-Functional Requirements" count={nfrs.length} animationDelay={sectionDelays.nfrs}>
          <div className="space-y-1.5">
            {nfrs.map((n) => (
              <div key={n.id} className="py-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-accent-cyan/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-cyan">
                    {n.category}
                  </span>
                  {n.target && <span className="text-[11px] text-text-muted">Target: {n.target}</span>}
                </div>
                <p className="mt-0.5 text-[12px] text-text-secondary">{n.description}</p>
              </div>
            ))}
          </div>
        </PrdSection>
      )}

      {/* Success Metrics */}
      {successMetrics.length > 0 && (
        <PrdSection title="Success Metrics" count={successMetrics.length} animationDelay={sectionDelays.successMetrics}>
          <div className="space-y-1.5">
            {successMetrics.map((m) => (
              <div key={m.id} className="py-1">
                <span className="text-[13px] font-medium text-text-primary">{m.name}</span>
                <p className="text-[12px] text-text-secondary">{m.description}</p>
                <div className="mt-0.5 flex gap-3 text-[11px] text-text-muted">
                  <span>Target: {m.target}</span>
                  <span>Measurement: {m.measurement}</span>
                </div>
              </div>
            ))}
          </div>
        </PrdSection>
      )}

      {/* Out of Scope */}
      {outOfScope.length > 0 && (
        <PrdSection title="Out of Scope" count={outOfScope.length} animationDelay={sectionDelays.outOfScope} defaultExpanded={false}>
          <ul className="space-y-1">
            {outOfScope.map((item, i) => (
              <li key={i} className="text-[12px] text-text-muted line-through decoration-text-muted/30">
                {item}
              </li>
            ))}
          </ul>
        </PrdSection>
      )}

      {/* Open Questions */}
      {gaps && gaps.length > 0 && (
        <PrdSection title="Open Questions" count={gaps.length} animationDelay={sectionDelays.openQuestions} defaultExpanded={false}>
          <OpenQuestionsSection gaps={gaps} />
        </PrdSection>
      )}

      {/* Assumptions */}
      {assumptions && assumptions.entries.length > 0 && (
        <PrdSection title="Assumptions" count={assumptions.entries.length} animationDelay={sectionDelays.assumptions} defaultExpanded={false}>
          <div className="space-y-2">
            {assumptions.entries.map((a) => (
              <div key={a.id} className="py-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-text-primary">{a.statement}</span>
                  {a.requiresConfirmation && (
                    <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                      Needs Review
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-[11px] text-text-muted">
                  <span>Confidence: {Math.round(a.confidence * 100)}%</span>
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${
                    a.blastRadius === 'critical' ? 'bg-red-500/10 text-red-400' :
                    a.blastRadius === 'high' ? 'bg-orange-500/10 text-orange-400' :
                    a.blastRadius === 'medium' ? 'bg-amber-500/10 text-amber-400' :
                    'bg-green-500/10 text-green-400'
                  }`}>
                    {a.blastRadius}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </PrdSection>
      )}
    </div>
  );
}
