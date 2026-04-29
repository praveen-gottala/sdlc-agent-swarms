'use client';

import React from 'react';
import { SegmentedControl } from '@mantine/core';

export interface ToggleItem {
  label: string;
  value: string;
}

export interface ToggleGroupProps {
  items: ToggleItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function ToggleGroup({
  items,
  value,
  onChange,
  className = '',
}: ToggleGroupProps): React.ReactElement {
  return (
    <SegmentedControl
      data={items}
      value={value}
      onChange={onChange}
      size="xs"
      className={className}
    />
  );
}
