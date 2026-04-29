'use client';

import React from 'react';
import { Tabs as MantineTabs } from '@mantine/core';

export interface TabItem {
  label: string;
  value: string;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function Tabs({ items, value, onChange, className = '' }: TabsProps): React.ReactElement {
  return (
    <MantineTabs
      value={value}
      onChange={(v) => { if (v) onChange(v); }}
      className={className}
    >
      <MantineTabs.List>
        {items.map((item) => (
          <MantineTabs.Tab key={item.value} value={item.value}>
            {item.label}
          </MantineTabs.Tab>
        ))}
      </MantineTabs.List>
    </MantineTabs>
  );
}
