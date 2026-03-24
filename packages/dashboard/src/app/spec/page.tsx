'use client';

import { useState, useEffect, useCallback } from 'react';
import { SpecTree } from '../../components/spec/spec-tree';
import { YamlViewer } from '../../components/spec/yaml-viewer';
import { StatusBadge } from '../../components/spec/status-badge';
import { DriftBadge } from '../../components/spec/drift-badge';

/** Available spec file paths mapped to their API routes. */
const SPEC_FILE_PATHS: Record<string, string> = {
  'project.yaml': '/api/spec/project',
  'pages.yaml': '/api/spec/pages',
  'api.yaml': '/api/spec/api',
  'models.yaml': '/api/spec/models',
  'BookCard.yaml': '/api/spec/components/BookCard',
  'SearchBar.yaml': '/api/spec/components/SearchBar',
  'NavHeader.yaml': '/api/spec/components/NavHeader',
};

/** Map of file names to their associated status. */
const fileStatuses: Record<string, 'designed' | 'specced' | 'coded' | 'tested' | 'deployed'> = {
  'project.yaml': 'coded',
  'pages.yaml': 'specced',
  'api.yaml': 'coded',
  'models.yaml': 'coded',
  'BookCard.yaml': 'coded',
  'SearchBar.yaml': 'specced',
  'NavHeader.yaml': 'designed',
};

/** Mock drift data for certain files. */
const fileDrift: Record<string, string> = {
  'api.yaml': 'POST /api/books implementation differs from spec: missing isbn validation field',
  'pages.yaml': 'BookDetail route param changed from :id to :bookId in code',
};

/** Spec Viewer page with tree navigation and YAML content display. */
export default function SpecPage() {
  const [selectedFile, setSelectedFile] = useState('project.yaml');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchSpec = useCallback((filename: string) => {
    setLoading(true);
    const apiPath = SPEC_FILE_PATHS[filename] ?? `/api/spec/${filename.replace('.yaml', '')}`;
    fetch(apiPath)
      .then(res => res.json())
      .then(json => {
        if (json.content) {
          setContent(json.content);
        } else if (json.error) {
          setContent(`# ${json.error}\n# Available paths: ${(json.availablePaths ?? []).join(', ')}`);
        } else {
          setContent(JSON.stringify(json, null, 2));
        }
        setLoading(false);
      })
      .catch(() => {
        setContent('# Error loading spec file');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchSpec(selectedFile);
  }, [selectedFile, fetchSpec]);

  const handleSelectFile = (filename: string) => {
    setSelectedFile(filename);
  };

  const status = fileStatuses[selectedFile];
  const drift = fileDrift[selectedFile];

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-white">Spec Viewer</h1>
          <p className="text-sm text-gray-400">Browse and inspect project specifications</p>
        </div>
        <div className="flex items-center gap-3">
          {status && <StatusBadge status={status} />}
          {drift && <DriftBadge hasDrift={true} description={drift} />}
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        <SpecTree selectedFile={selectedFile} onSelectFile={handleSelectFile} />
        <div className="flex-1 overflow-hidden p-4">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-text-muted">Loading...</div>
          ) : (
            <YamlViewer content={content} filename={selectedFile} />
          )}
        </div>
      </div>
    </div>
  );
}
