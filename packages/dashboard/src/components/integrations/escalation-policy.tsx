import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * Read-only display of the escalation/timeout policy for approvals.
 */
export function EscalationPolicy() {
  return (
    <Card header="Escalation Policy">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Approval timeout</span>
          <span className="font-medium text-text-primary">60 min</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">On timeout</span>
          <Badge variant="warning">Escalate to secondary</Badge>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Secondary timeout</span>
          <span className="font-medium text-text-primary">120 min</span>
        </div>

        <div className="rounded-md border border-accent-red/30 bg-accent-red/5 px-3 py-2">
          <p className="text-xs font-medium text-accent-red">
            Auto-approve on timeout is never allowed
          </p>
        </div>

        <div className="flex justify-end">
          <Button size="sm" variant="ghost">
            Edit
          </Button>
        </div>
      </div>
    </Card>
  );
}
