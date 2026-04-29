'use client';

import React from 'react';
import { TextInput } from '@mantine/core';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  ref?: React.Ref<HTMLInputElement>;
}

export function Input({ label, error, className = '', ref, size: _size, ...rest }: InputProps): React.ReactElement {
  return (
    <TextInput
      ref={ref}
      label={label}
      error={error}
      className={className}
      size="sm"
      {...rest}
    />
  );
}
