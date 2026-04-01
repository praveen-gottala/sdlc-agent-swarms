'use client';

import { useState } from 'react';

interface SpecTreeNode {
  name: string;
  type: 'file' | 'folder';
  children?: SpecTreeNode[];
}

interface SpecTreeProps {
  /** Currently selected file name */
  selectedFile: string;
  /** Callback when a file is selected */
  onSelectFile: (filename: string) => void;
  /** Optional dynamic tree data. Falls back to static default if not provided. */
  tree?: SpecTreeNode[];
}

const defaultSpecTree: SpecTreeNode[] = [
  { name: 'project.yaml', type: 'file' },
  { name: 'pages.yaml', type: 'file' },
  {
    name: 'components',
    type: 'folder',
    children: [
      { name: 'BookCard.yaml', type: 'file' },
      { name: 'SearchBar.yaml', type: 'file' },
      { name: 'NavHeader.yaml', type: 'file' },
    ],
  },
  { name: 'api.yaml', type: 'file' },
  { name: 'models.yaml', type: 'file' },
];

/** Recursive tree item renderer. */
function TreeItem({
  node,
  depth,
  selectedFile,
  onSelectFile,
}: {
  node: SpecTreeNode;
  depth: number;
  selectedFile: string;
  onSelectFile: (filename: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isFolder = node.type === 'folder';
  const isActive = !isFolder && node.name === selectedFile;

  const handleClick = () => {
    if (isFolder) {
      setExpanded((prev) => !prev);
    } else {
      onSelectFile(node.name);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
          isActive
            ? 'bg-cyan-500/20 text-cyan-300'
            : 'text-gray-300 hover:bg-white/5 hover:text-white'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <span className="flex-shrink-0 text-xs">
          {isFolder ? (expanded ? '📂' : '📁') : '📄'}
        </span>
        <span className="truncate">{node.name}</span>
      </button>

      {isFolder && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.name}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Left-panel tree navigation for spec files. */
export function SpecTree({ selectedFile, onSelectFile, tree }: SpecTreeProps) {
  const nodes = tree && tree.length > 0 ? tree : defaultSpecTree;
  return (
    <div className="flex h-full w-[250px] flex-shrink-0 flex-col border-r border-white/10 bg-[#13141f]">
      <div className="border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-200">Spec Files</h2>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {nodes.map((node) => (
          <TreeItem
            key={node.name}
            node={node}
            depth={0}
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
          />
        ))}
      </nav>
    </div>
  );
}
