'use client';

import React from 'react';
import { Select as MantineSelect } from '@mantine/core';

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  options: SelectOption[];
  placeholder?: string;
  ref?: React.Ref<HTMLSelectElement>;
}

export function Select({ label, options, placeholder, className = '', value, onChange, disabled, id, 'data-testid': dataTestId, ..._rest }: SelectProps & { 'data-testid'?: string }): React.ReactElement {
  return (
    <MantineSelect
      label={label}
      data={options}
      placeholder={placeholder}
      value={value as string | undefined}
      onChange={(val) => {
        if (onChange) {
          const syntheticEvent = { target: { value: val ?? '' } } as React.ChangeEvent<HTMLSelectElement>;
          onChange(syntheticEvent);
        }
      }}
      disabled={disabled}
      className={className}
      size="sm"
      id={id}
      data-testid={dataTestId}
    />
  );
}
