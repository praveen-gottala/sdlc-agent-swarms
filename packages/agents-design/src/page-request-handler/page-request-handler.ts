/**
 * @module @agentforge/agents-design/page-request-handler
 *
 * Page Request Handler — NOT an LLM agent.
 * A routing function that creates a page entry, creates a task,
 * and publishes a PageRequested event to kick off the design pipeline.
 */

import { join } from 'node:path';
import type { EventBus, FileSystem, Result, TaskEntry } from '@agentforge/core';
import { Ok, Err, readYaml, writeYaml, loadTasks, addTask, saveTasks } from '@agentforge/core';

/** Input for the page request handler. */
export interface PageRequestInput {
  readonly description: string;
  readonly projectRoot: string;
  readonly pageId?: string;
}

/** Output produced by the page request handler. */
export interface PageRequestOutput {
  readonly pageId: string;
  readonly taskId: string;
}

/** Generate a page ID from the description. */
const generatePageId = (description: string): string => {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `page_${slug}_${suffix}`;
};

/** Generate a task ID. */
const generateTaskId = (): string => {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `task_design_${suffix}`;
};

/**
 * Handle a page design request.
 * Creates a page entry, a task, and publishes PageRequested.
 */
export const handlePageRequest = (
  input: PageRequestInput,
  eventBus: EventBus,
  fs: FileSystem,
): Result<PageRequestOutput> => {
  const { description, projectRoot } = input;
  const pageId = input.pageId ?? generatePageId(description);
  const taskId = generateTaskId();

  // 1. Update pages.yaml with the new page entry
  const pagesPath = join(projectRoot, 'agentforge/spec/pages.yaml');
  const existingPages = readYaml<{ pages?: unknown[] }>(pagesPath, fs);
  const pages = existingPages.ok ? (existingPages.value.pages ?? []) : [];

  const newPage = {
    id: pageId,
    description,
    status: 'requested',
    created_at: new Date().toISOString(),
  };

  const writeResult = writeYaml(pagesPath, { pages: [...pages, newPage] }, fs);
  if (!writeResult.ok) {
    return Err(writeResult.error);
  }

  // 2. Create a task for this design request
  const tasksResult = loadTasks(projectRoot, fs);
  const currentTasks = tasksResult.ok ? tasksResult.value : { tasks: [] };

  const taskEntry: TaskEntry = {
    id: taskId,
    title: `Design page: ${description}`,
    phase: 'design',
    agent: 'ux_researcher',
    status: 'pending',
    depends_on: [],
    spec_ref: `agentforge/spec/pages.yaml#${pageId}`,
    branch: null,
    pr_number: null,
    cost_usd: 0,
    tokens_used: 0,
    attempts: 0,
    max_attempts: 3,
    hitl_status: 'none',
    hitl_channel: null,
  };

  const addResult = addTask(currentTasks, taskEntry);
  if (!addResult.ok) {
    return Err(addResult.error);
  }

  const saveResult = saveTasks(projectRoot, addResult.value, fs);
  if (!saveResult.ok) {
    return Err(saveResult.error);
  }

  // 3. Publish PageRequested event
  eventBus.publish({
    type: 'PageRequested',
    pageId,
    taskId,
    description,
    source: 'agent:page_request_handler',
    timestamp: Date.now(),
  });

  return Ok({ pageId, taskId });
};
