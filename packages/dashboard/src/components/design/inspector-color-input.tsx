'use client';

import React, { useCallback, useRef } from 'react';

interface InspectorColorInputProps {
  value: string;
  onChange: (v: string) => void;
  colorMap?: Record<string, string>;
  testId?: string;
}

const HEX_RE = /^#([0-9a-fA-F]{3}){1,2}$/;

/**
 * Compound color input: small swatch (native color picker) + text input.
 *
 * - If `value` is a hex, swatch shows it directly.
 * - If `value` is a token name found in `colorMap`, swatch shows the resolved hex.
 * - Otherwise, swatch shows neutral gray with a dashed border.
 */
export function InspectorColorInput({ value, onChange, colorMap, testId }: InspectorColorInputProps) {
  const colorRef = useRef<HTMLInputElement>(null);

  const resolvedHex = resolveToHex(value, colorMap);
  const isUnresolved = !resolvedHex;
  const swatchColor = resolvedHex ?? '#888888';

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  const handleSwatchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  const handleSwatchClick = useCallback(() => {
    colorRef.current?.click();
  }, []);

  return (
    <div className="flex items-center gap-1.5">
      {/* Color swatch */}
      <button
        type="button"
        onClick={handleSwatchClick}
        className={[
          'flex-shrink-0 w-6 h-6 rounded border',
          isUnresolved ? 'border-dashed border-text-muted' : 'border-border',
        ].join(' ')}
        style={{ backgroundColor: swatchColor }}
        data-testid={testId ? `${testId}-swatch` : undefined}
        aria-label="Pick color"
      />
      <input
        ref={colorRef}
        type="color"
        value={swatchColor}
        onChange={handleSwatchChange}
        className="sr-only"
        tabIndex={-1}
        data-testid={testId ? `${testId}-picker` : undefined}
      />
      {/* Text input */}
      <input
        type="text"
        value={value}
        onChange={handleTextChange}
        data-testid={testId}
        className="flex-1 min-w-0 rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-primary hover:border-text-muted focus-ring transition-colors"
      />
    </div>
  );
}

function resolveToHex(
  value: string,
  colorMap?: Record<string, string>,
): string | null {
  if (!value) return null;
  if (HEX_RE.test(value)) return value;
  if (colorMap && value in colorMap) {
    const resolved = colorMap[value];
    if (HEX_RE.test(resolved)) return resolved;
  }
  return null;
}
