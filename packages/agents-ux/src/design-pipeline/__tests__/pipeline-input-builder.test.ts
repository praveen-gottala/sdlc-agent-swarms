/**
 * Tests for the shared buildPipelineInput() builder (M1 Phase 1, D4).
 *
 * Uses real filesystem via temp directories — no mocks for file I/O.
 */

import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stringify } from 'yaml';
import type { AgentContext, LLMProviderRef } from '@agentforge/core';
import { createRealFs, Ok } from '@agentforge/core';
import { buildPipelineInput } from '../pipeline-input-builder.js';

function createTempProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pipeline-input-test-'));
  mkdirSync(join(dir, 'agentforge/spec'), { recursive: true });
  mkdirSync(join(dir, 'docs'), { recursive: true });
  return dir;
}

function writePagesYaml(projectRoot: string, pages: Array<Record<string, unknown>>): void {
  writeFileSync(
    join(projectRoot, 'agentforge/spec/pages.yaml'),
    stringify({ pages }),
  );
}

function writeDesignTokens(projectRoot: string): void {
  writeFileSync(
    join(projectRoot, 'agentforge/spec/design-tokens.yaml'),
    stringify({
      version: '1.0',
      created_by: 'test',
      colors: {
        primitive: { blue500: '#3B82F6' },
        semantic: { primary: '#3B82F6' },
      },
      typography: {
        font_families: { heading: 'Inter', body: 'Inter' },
      },
    }),
  );
}

function writePrd(projectRoot: string, content: string): void {
  writeFileSync(join(projectRoot, 'docs/prd.md'), content);
}

function createMockAgentContext(projectRoot: string): AgentContext {
  return {
    taskId: 'test-task',
    projectRoot,
    eventBus: { emit: jest.fn(), on: jest.fn(), off: jest.fn(), once: jest.fn() } as unknown as AgentContext['eventBus'],
    fs: createRealFs(),
    runGovernance: jest.fn(),
    resolveProvider: jest.fn().mockReturnValue(Ok({
      name: 'test',
      complete: jest.fn(),
      stream: jest.fn(),
      estimateCost: jest.fn(),
    } as LLMProviderRef)),
    recordAudit: jest.fn(),
  };
}

describe('buildPipelineInput', () => {
  it('builds PipelineInput from fixture with pages.yaml and design-tokens', () => {
    const projectRoot = createTempProjectDir();
    writePagesYaml(projectRoot, [
      { id: 'dashboard', name: 'Dashboard', description: 'Main dashboard', route: '/dashboard', status: 'pending', components: ['Header', 'Sidebar'] },
      { id: 'settings', name: 'Settings', description: 'User settings', route: '/settings', status: 'pending' },
    ]);
    writeDesignTokens(projectRoot);
    writePrd(projectRoot, '# Test PRD\nA test PRD.');

    const agentContext = createMockAgentContext(projectRoot);
    const result = buildPipelineInput({
      pageId: 'dashboard',
      taskId: 'task-1',
      projectRoot,
      agentContext,
    });

    expect(result).not.toBeNull();
    expect(result!.moduleId).toBe('dashboard');
    expect(result!.taskId).toBe('task-1');
    expect(result!.projectRoot).toBe(projectRoot);
    expect(result!.designTool).toBe('browser');
    expect(result!.providerString).toBe('claude');
    expect(result!.resume).toBe(true);
    expect(result!.prdRequirements).toBeDefined();
    expect(result!.prdRequirements!.length).toBeGreaterThanOrEqual(1);
    expect(result!.prdRequirements![0]).toContain('Main dashboard');
    expect(result!.designTokensSpec).toBeDefined();
    expect(result!.viewportWidth).toBeDefined();
    expect(result!.pageContext).toBeDefined();
  });

  it('includes prdContent in prdRequirements when docs/prd.md exists', () => {
    const projectRoot = createTempProjectDir();
    writePagesYaml(projectRoot, [
      { id: 'home', name: 'Home', description: 'Home page', route: '/', status: 'pending' },
    ]);
    writePrd(projectRoot, '# CashPulse PRD\nBudget tracking app.');

    const result = buildPipelineInput({
      pageId: 'home',
      taskId: 'task-2',
      projectRoot,
      agentContext: createMockAgentContext(projectRoot),
    });

    expect(result).not.toBeNull();
    expect(result!.prdRequirements).toBeDefined();
    expect(result!.prdRequirements!.some(r => r.includes('CashPulse PRD'))).toBe(true);
  });

  it('returns null when page not found in pages.yaml', () => {
    const projectRoot = createTempProjectDir();
    writePagesYaml(projectRoot, [
      { id: 'dashboard', name: 'Dashboard', description: 'Main', route: '/dashboard', status: 'pending' },
    ]);

    const result = buildPipelineInput({
      pageId: 'nonexistent',
      taskId: 'task-3',
      projectRoot,
      agentContext: createMockAgentContext(projectRoot),
    });

    expect(result).toBeNull();
  });

  it('returns null when pages.yaml is missing', () => {
    const projectRoot = createTempProjectDir();

    const result = buildPipelineInput({
      pageId: 'dashboard',
      taskId: 'task-4',
      projectRoot,
      agentContext: createMockAgentContext(projectRoot),
    });

    expect(result).toBeNull();
  });

  it('passes through optional fields (designTool, providerString, resume, stage, chromePass)', () => {
    const projectRoot = createTempProjectDir();
    writePagesYaml(projectRoot, [
      { id: 'page-1', name: 'Page 1', description: 'Test', route: '/p1', status: 'pending' },
    ]);

    const result = buildPipelineInput({
      pageId: 'page-1',
      taskId: 'task-5',
      projectRoot,
      agentContext: createMockAgentContext(projectRoot),
      designTool: 'penpot',
      providerString: 'openai',
      resume: false,
      stage: 'design',
      chromePass: { mode: 'generate' },
    });

    expect(result).not.toBeNull();
    expect(result!.designTool).toBe('penpot');
    expect(result!.providerString).toBe('openai');
    expect(result!.resume).toBe(false);
    expect(result!.stage).toBe('design');
    expect(result!.chromePass).toEqual({ mode: 'generate' });
  });

  it('resolves viewport for screen_type=modal', () => {
    const projectRoot = createTempProjectDir();
    writePagesYaml(projectRoot, [
      { id: 'modal-1', name: 'Settings Modal', description: 'Modal', route: '/modal', status: 'pending', screen_type: 'modal' },
    ]);

    const result = buildPipelineInput({
      pageId: 'modal-1',
      taskId: 'task-6',
      projectRoot,
      agentContext: createMockAgentContext(projectRoot),
    });

    expect(result).not.toBeNull();
    expect(result!.viewportWidth).toBe(560);
  });

  it('cliWidth overrides per-page viewports and design config breakpoints', () => {
    const projectRoot = createTempProjectDir();
    writePagesYaml(projectRoot, [
      { id: 'page-1', name: 'Page 1', description: 'Test', route: '/p1', status: 'pending', viewports: [375] },
    ]);

    const result = buildPipelineInput({
      pageId: 'page-1',
      taskId: 'task-cli-width',
      projectRoot,
      agentContext: createMockAgentContext(projectRoot),
      cliWidth: 1280,
    });

    expect(result).not.toBeNull();
    expect(result!.viewportWidth).toBe(1280);
  });

  it('builds rendererTokens and strips version/created_by when design tokens exist', () => {
    const projectRoot = createTempProjectDir();
    writePagesYaml(projectRoot, [
      { id: 'page-1', name: 'Page 1', description: 'Test', route: '/p1', status: 'pending' },
    ]);
    writeDesignTokens(projectRoot);

    const result = buildPipelineInput({
      pageId: 'page-1',
      taskId: 'task-7',
      projectRoot,
      agentContext: createMockAgentContext(projectRoot),
    });

    expect(result).not.toBeNull();
    expect(result!.rendererTokens).toBeDefined();
    expect(result!.rendererTokens!['version' as string]).toBeUndefined();
    expect(result!.rendererTokens!['created_by' as string]).toBeUndefined();
    expect(result!.rendererTokens!['colors' as string]).toBeDefined();
  });
});
