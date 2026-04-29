'use client';

import React from 'react';
import { Modal as MantineModal } from '@mantine/core';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: string;
  children: React.ReactNode;
}

const WIDTH_MAP: Record<string, string> = {
  'max-w-sm': 'sm',
  'max-w-md': 'md',
  'max-w-lg': 'lg',
  'max-w-xl': 'xl',
  'max-w-2xl': '800',
};

export function Modal({
  open,
  onClose,
  title,
  width = 'max-w-lg',
  children,
}: ModalProps): React.ReactElement | null {
  return (
    <MantineModal
      opened={open}
      onClose={onClose}
      title={title}
      size={WIDTH_MAP[width] ?? 'lg'}
      centered
      overlayProps={{ backgroundOpacity: 0.6, blur: 2 }}
    >
      {children}
    </MantineModal>
  );
}
