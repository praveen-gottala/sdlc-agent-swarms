import React from 'react';
import { Tag } from '@/components/ui/tag';

export interface RoutingTag {
  name: string;
  color: string;
}

export interface RoutingTagsProps {
  tags: RoutingTag[];
  className?: string;
}

/**
 * Renders a list of colored routing rule pills.
 */
export function RoutingTags({ tags, className = '' }: RoutingTagsProps) {
  return (
    <div className={['flex flex-wrap gap-1.5', className].join(' ')}>
      {tags.map((tag) => (
        <Tag key={tag.name} color={tag.color}>
          {tag.name}
        </Tag>
      ))}
    </div>
  );
}
