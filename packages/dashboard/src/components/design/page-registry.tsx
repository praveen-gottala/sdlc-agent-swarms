'use client';

import React, { useState, useMemo } from 'react';
import {
  TextInput,
  Tooltip,
  ScrollArea,
  Loader,
  UnstyledButton,
  Box,
  Text,
  Stack,
  Group,
} from '@mantine/core';
import { IconSearch, IconPlus } from '@tabler/icons-react';
import { Button } from '../ui/button';

export interface Page {
  id: string;
  name: string;
  description?: string;
  status?: string;
  designStatus?: string;
  components?: string[];
}

export interface PageRegistryProps {
  pages: Page[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'var(--mantine-color-gray-6)' },
  generating: { label: 'Generating', color: 'var(--mantine-color-blue-5)' },
  rendered: { label: 'Rendered', color: 'var(--mantine-color-yellow-5)' },
  correction: { label: 'Correction', color: 'var(--mantine-color-yellow-5)' },
  approved: { label: 'Approved', color: 'var(--mantine-color-green-5)' },
  locked: { label: 'Locked', color: 'var(--mantine-color-violet-5)' },
};

function getStatusConfig(designStatus: string, specStatus?: string): { label: string; color: string } {
  if (designStatus && designStatus !== 'draft') {
    return STATUS_CONFIG[designStatus] ?? { label: designStatus, color: 'var(--mantine-color-gray-6)' };
  }
  if (specStatus === 'approved') {
    return { label: 'Ready to design', color: 'var(--mantine-color-blue-5)' };
  }
  if (specStatus === 'requested' || specStatus === 'draft') {
    return { label: 'Spec pending', color: 'var(--mantine-color-gray-6)' };
  }
  return STATUS_CONFIG.draft;
}

export function PageRegistry({ pages, selectedId, onSelect, onCreateNew }: PageRegistryProps): React.ReactElement {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return pages;
    const q = search.toLowerCase();
    return pages.filter(p => p.name.toLowerCase().includes(q));
  }, [pages, search]);

  return (
    <Stack gap={0} h="100%">
      {/* Header with search */}
      <Box px="sm" py="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Group justify="space-between" mb={4}>
          <Text size="sm" fw={600} component="h3" m={0}>Pages</Text>
          <Text size="xs" c="dimmed">{pages.length}</Text>
        </Group>
        <TextInput
          placeholder="Filter screens..."
          size="xs"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      </Box>

      {/* Page list */}
      <ScrollArea flex={1} type="auto" offsetScrollbars>
        <Stack gap={2} p="xs">
          {filtered.map((page) => {
            const isSelected = page.id === selectedId;
            const isGenerating = page.designStatus === 'generating';
            const config = getStatusConfig(page.designStatus ?? 'draft', page.status);

            return (
              <UnstyledButton
                key={page.id}
                data-testid={`page-${page.id}`}
                onClick={() => onSelect(page.id)}
                px="sm"
                py={8}
                style={{
                  borderRadius: 'var(--mantine-radius-md)',
                  borderLeft: `3px solid ${isSelected ? 'var(--mantine-color-blue-5)' : config.color}`,
                  backgroundColor: isSelected ? 'var(--mantine-color-blue-light)' : undefined,
                  transition: 'all 150ms ease',
                }}
                className={isSelected ? '' : 'hover-bg-elevated'}
              >
                <Group justify="space-between" gap="xs" wrap="nowrap" align="flex-start">
                  <Box flex={1} miw={0}>
                    <Text
                      size="sm"
                      fw={500}
                      lineClamp={2}
                      style={{ wordBreak: 'break-word' }}
                    >
                      {page.name}
                    </Text>
                    {page.description && (
                      <Tooltip label={page.description} multiline maw={260} position="right" withArrow>
                        <Text size="xs" c="dimmed" lineClamp={1} mt={2}>
                          {page.description}
                        </Text>
                      </Tooltip>
                    )}
                  </Box>
                  {/* Status indicator */}
                  {isGenerating ? (
                    <Loader size={14} color="blue" mt={3} />
                  ) : (
                    <Tooltip label={config.label} position="right" withArrow>
                      <Box
                        w={8}
                        h={8}
                        mt={5}
                        style={{
                          borderRadius: '50%',
                          backgroundColor: config.color,
                          flexShrink: 0,
                          animation: page.designStatus === 'generating' ? 'pulseAccent 1.5s ease-in-out infinite' : undefined,
                        }}
                      />
                    </Tooltip>
                  )}
                </Group>
              </UnstyledButton>
            );
          })}

          {filtered.length === 0 && (
            <Text ta="center" py="xl" size="xs" c="dimmed">
              {search ? 'No pages match your filter' : 'No pages yet. Create one to get started.'}
            </Text>
          )}
        </Stack>
      </ScrollArea>

      {/* Footer with new page button */}
      <Box px="sm" py="sm" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          data-testid="create-page-btn"
          onClick={onCreateNew}
        >
          <Group gap={4}>
            <IconPlus size={14} />
            <span>New page</span>
          </Group>
        </Button>
      </Box>
    </Stack>
  );
}
