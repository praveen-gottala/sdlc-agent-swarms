'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup } from '@/components/ui/toggle-group';

interface PhaseConfig {
  key: string;
  label: string;
  description: string;
}

const PHASES: PhaseConfig[] = [
  { key: 'ux_research', label: 'Research', description: 'Context analysis' },
  { key: 'ux_planning', label: 'Planning', description: 'Component tree' },
  { key: 'ux_design', label: 'Design', description: 'DesignSpec JSON' },
  { key: 'ux_evaluator', label: 'Evaluate', description: 'Vision quality' },
  { key: 'ux_correction', label: 'Correction', description: 'Iterative fixes' },
];

interface ModelInfo {
  id: string;
  label: string;
  tier: 'quality' | 'balanced' | 'economy';
}

interface Preset {
  id: string;
  name: string;
  description: string;
  overrides: Record<string, string>;
}

interface PipelineModelsResponse {
  phaseModels: Record<string, string>;
  presets: Preset[];
  availableModels: ModelInfo[];
  defaultModel: string;
}

const TIER_BADGES: Record<string, { label: string; variant: 'purple' | 'info' | 'success' }> = {
  'claude-opus-4-7': { label: 'Quality', variant: 'purple' },
  'claude-opus-4-6': { label: 'Quality', variant: 'purple' },
  'claude-sonnet-4-6': { label: 'Fast', variant: 'info' },
  'claude-haiku-4-5': { label: 'Economy', variant: 'success' },
};

function detectPreset(models: Record<string, string>, presets: Preset[]): string {
  for (const preset of presets) {
    const matches = Object.entries(preset.overrides).every(
      ([key, value]) => models[key] === value,
    );
    if (matches) return preset.id;
  }
  return 'custom';
}

export function PipelineModelConfig() {
  const [models, setModels] = useState<Record<string, string>>({});
  const [presets, setPresets] = useState<Preset[]>([]);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [activePreset, setActivePreset] = useState('custom');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    const res = await fetch('/api/providers/pipeline-models');
    if (!res.ok) return;
    const data: PipelineModelsResponse = await res.json();
    setModels(data.phaseModels);
    setPresets(data.presets);
    setAvailableModels(data.availableModels);
    setActivePreset(detectPreset(data.phaseModels, data.presets));
  }, []);

  useEffect(() => {
    fetchConfig()
      .then(() => setLoading(false))
      .catch(() => setLoading(false));
  }, [fetchConfig]);

  const handlePresetChange = useCallback(
    (presetId: string) => {
      if (presetId === 'custom') {
        setActivePreset('custom');
        return;
      }
      const preset = presets.find((p) => p.id === presetId);
      if (preset) {
        setModels({ ...models, ...preset.overrides });
        setActivePreset(presetId);
        setSaved(false);
      }
    },
    [presets, models],
  );

  const handleModelChange = useCallback(
    (roleKey: string, modelId: string) => {
      const updated = { ...models, [roleKey]: modelId };
      setModels(updated);
      setActivePreset(detectPreset(updated, presets));
      setSaved(false);
    },
    [models, presets],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/providers/pipeline-models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: models }),
      });
      if (res.ok) {
        await fetchConfig();
        setSaved(true);
        setTimeout(() => setSaved(false), 8000);
      }
    } finally {
      setSaving(false);
    }
  }, [models, fetchConfig]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-text-muted text-sm">
        Loading pipeline configuration...
      </div>
    );
  }

  const modelOptions = availableModels.map((m) => ({
    label: m.label,
    value: m.id,
  }));

  const presetItems = [
    ...presets.map((p) => ({ label: p.name, value: p.id })),
    { label: 'Custom', value: 'custom' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">
          Design Pipeline Models
        </h3>
        <p className="mt-1 text-sm text-text-muted">
          Configure which LLM model powers each pipeline phase. Saved to{' '}
          <code className="rounded bg-bg-elevated px-1.5 py-0.5 text-xs font-mono text-text-secondary">
            agentforge.yaml
          </code>
        </p>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-text-secondary">Preset:</span>
        <ToggleGroup
          items={presetItems}
          value={activePreset}
          onChange={handlePresetChange}
        />
        {activePreset !== 'custom' && (
          <span className="text-xs text-text-muted">
            {presets.find((p) => p.id === activePreset)?.description}
          </span>
        )}
      </div>

      <div className="flex items-stretch gap-2">
        {PHASES.map((phase, idx) => {
          const currentModel = models[phase.key] ?? 'claude-sonnet-4-6';
          const badge = TIER_BADGES[currentModel];
          const isEvaluator = phase.key === 'ux_evaluator';
          const isNonDefaultEval = isEvaluator && currentModel !== 'claude-opus-4-7';

          return (
            <React.Fragment key={phase.key}>
              {idx > 0 && (
                <div className="flex items-center text-text-muted text-lg select-none">
                  &rarr;
                </div>
              )}
              <div className="flex-1 rounded-lg border border-border bg-bg-card p-3 min-w-[140px]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-text-primary">
                    {phase.label}
                  </span>
                  {badge && (
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  )}
                </div>
                <p className="text-xs text-text-muted mb-3">{phase.description}</p>
                <Select
                  options={modelOptions}
                  value={currentModel}
                  onChange={(e) => handleModelChange(phase.key, e.target.value)}
                />
                {isNonDefaultEval && (
                  <p className="mt-2 text-xs text-yellow-400">
                    Vision quality may degrade with non-Opus models
                  </p>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>

      {saved && (
        <div className="rounded-lg border border-green-800 bg-green-950/30 p-4">
          <p className="text-sm font-medium text-green-400 mb-2">Configuration saved</p>
          <p className="text-xs text-text-muted mb-2">Next pipeline run will use:</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {PHASES.map((phase) => {
              const modelId = models[phase.key] ?? 'claude-sonnet-4-6';
              const model = availableModels.find((m) => m.id === modelId);
              return (
                <span key={phase.key} className="text-text-secondary">
                  <span className="text-text-muted">{phase.label}:</span>{' '}
                  {model?.label ?? modelId}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
