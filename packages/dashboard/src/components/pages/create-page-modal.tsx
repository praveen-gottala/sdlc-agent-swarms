'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';

interface CreatePageModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreatePageModal({ open, onClose }: CreatePageModalProps) {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    const trimmed = description.trim();
    if (!trimmed) {
      setError('Please enter a page description.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: trimmed }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Failed to create page');
        setLoading(false);
        return;
      }

      const data = (await res.json()) as { pageId: string };
      setDescription('');
      setLoading(false);
      onClose();
      router.push(`/design?page=${data.pageId}`);
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setDescription('');
    setError('');
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Design a New Page" width="max-w-lg">
      <div className="space-y-4">
        <div>
          <label
            htmlFor="page-description"
            className="block text-sm font-medium text-text-secondary mb-1"
          >
            Page Description
          </label>
          <textarea
            id="page-description"
            data-testid="create-page-input"
            className="w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue"
            rows={4}
            placeholder="Describe the page you want to design, e.g. 'A product listing page with search filters, grid of product cards, and pagination'"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              if (error) setError('');
            }}
            disabled={loading}
          />
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="rounded-md border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-elevated disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="create-page-submit"
            onClick={handleGenerate}
            disabled={loading || !description.trim()}
            className="rounded-md bg-accent-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-blue/80 disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
