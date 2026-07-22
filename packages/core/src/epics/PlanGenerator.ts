/**
 * aidlc-autopilot: Plan generator.
 *
 * Analyzes epic scope/complexity and generates a preview plan showing:
 * - How many agents will run
 * - What phases they'll execute
 * - Task breakdown
 * - Estimated timeline
 */

import type { PipelineConfig } from '../schema/WorkspaceSchema';
import type { EpicContext } from './ContextCollector';

/** Minimal shape of an agent definition needed for plan generation. */
interface AgentLike {
  id: string;
  skills?: string[];
}

/** Minimal shape of the workspace doc needed for plan generation. */
interface WorkspaceLike {
  agents?: AgentLike[];
}

/** Normalized pipeline step (steps in YAML may be a bare string or an object). */
interface NormalizedStep {
  name: string;
  agent?: string;
  skills?: string[];
}

function normalizeStep(step: unknown): NormalizedStep {
  if (typeof step === 'string') {
    return { name: step };
  }
  const s = step as Record<string, unknown>;
  return {
    name: (s.name as string) || (s.agent as string) || 'unknown',
    agent: s.agent as string | undefined,
    skills: s.skills as string[] | undefined,
  };
}

export type ScopeComplexity = 'simple' | 'medium' | 'complex';

export interface AgentAllocation {
  phase: string;
  agent_id: string;
  count: number;
  skills: string[];
}

export interface Task {
  phase: string;
  task_id: string;
  description: string;
  size: 'small' | 'medium' | 'large';
}

export interface DiscoveryStep {
  /** What the autopilot inspected/collected before planning. */
  gathered: string[];
  /** Open questions or missing context the agents must resolve first. */
  open_questions: string[];
  /** Whether a discovery gate is present in the pipeline (aidlc-discovery-gate skill). */
  gate_present: boolean;
}

export interface PhaseSuggestion {
  /** Suggested phase name, e.g. "prototype". */
  phase: string;
  /** Why the autopilot recommends inserting it. */
  reason: string;
}

export interface AutopilotPlan {
  epic: string;
  context: EpicContext;
  scope_complexity: ScopeComplexity;
  /** Discovery precedes all execution phases — what's known, what's missing. */
  discovery: DiscoveryStep;
  phases: {
    name: string;
    agents: AgentAllocation[];
  }[];
  /** Phases the autopilot recommends adding (e.g. prototype for UI work with no design). */
  suggestions: PhaseSuggestion[];
  estimated_timeline: string;
  total_agent_count: number;
  tasks: Task[];
  generated_at: string;
}

/**
 * Infer scope complexity from epic description.
 *
 * Simple heuristics:
 * - "simple" if mentions: "form", "button", "CRUD", "landing page", "list"
 * - "complex" if mentions: "refactor", "microservice", "system", "redesign", "migration"
 * - "medium" otherwise
 */
function inferScopeComplexity(scope: string): ScopeComplexity {
  const lowerScope = scope.toLowerCase();

  const simpleKeywords = ['form', 'button', 'crud', 'landing', 'list', 'page', 'simple', 'minor'];
  const complexKeywords = ['refactor', 'microservice', 'system', 'redesign', 'migration', 'overhaul', 'rewrite'];

  if (simpleKeywords.some((kw) => lowerScope.includes(kw))) {
    return 'simple';
  }

  if (complexKeywords.some((kw) => lowerScope.includes(kw))) {
    return 'complex';
  }

  return 'medium';
}

/**
 * Allocate agent count per phase based on complexity.
 *
 * - Simple: 1-2 agents per phase
 * - Medium: 2-3 agents per phase
 * - Complex: 3-5+ agents per phase
 */
function allocateAgentCount(complexity: ScopeComplexity, phaseCount: number): number {
  switch (complexity) {
    case 'simple':
      return 1;
    case 'medium':
      return 2;
    case 'complex':
      return Math.min(3 + Math.floor(phaseCount / 2), 5);
    default:
      return 2;
  }
}

/**
 * Estimate timeline based on complexity and total agent count.
 */
function estimateTimeline(complexity: ScopeComplexity, totalAgents: number): string {
  if (complexity === 'simple') return '1-2 days';
  if (complexity === 'medium') return totalAgents > 4 ? '5-7 days' : '2-4 days';
  return totalAgents > 8 ? '2-3 weeks' : '1-2 weeks';
}

/**
 * Parse implicit tasks from epic description.
 *
 * Simple regex: look for capitalized words / noun phrases that might indicate separate tasks.
 * Examples:
 * - "Add user authentication and admin dashboard" → ["user authentication", "admin dashboard"]
 * - "Refactor database schema for multi-tenancy" → ["database schema", "multi-tenancy"]
 */
function extractTasks(scope: string): string[] {
  // Very simple heuristic: split on "and" and extract noun phrases
  const tasks: string[] = [];
  const parts = scope.split(/\s+and\s+/i);

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length > 0 && trimmed.length < 100) {
      tasks.push(trimmed);
    }
  }

  return tasks.length > 0 ? tasks : [scope];
}

/** Detect whether the scope implies UI/frontend work. */
function scopeInvolvesUI(scope: string): boolean {
  const lower = scope.toLowerCase();
  const uiKeywords = [
    'ui', 'ux', 'screen', 'page', 'form', 'button', 'view', 'component',
    'dashboard', 'modal', 'panel', 'layout', 'frontend', 'design', 'widget',
    'sidebar', 'menu', 'dialog', 'webview',
  ];
  return uiKeywords.some((kw) => lower.includes(kw));
}

/** Build the discovery step: what's known, what's missing, is a gate present. */
function buildDiscovery(context: EpicContext, steps: NormalizedStep[]): DiscoveryStep {
  const gathered: string[] = [];
  const openQuestions: string[] = [];

  if (context.spec_url) {
    gathered.push(`Spec found: ${context.spec_url}`);
  } else {
    openQuestions.push('No spec/PRD detected — clarify requirements before implementing.');
  }

  if (context.codebase_paths?.length) {
    gathered.push(`Codebase paths: ${context.codebase_paths.join(', ')}`);
  } else {
    openQuestions.push('No codebase source dirs detected — confirm where code lives.');
  }

  if (context.its_location?.length) {
    gathered.push(`Test locations: ${context.its_location.join(', ')}`);
  } else {
    openQuestions.push('No test directory detected — decide where tests go.');
  }

  if (context.design_url) {
    gathered.push(`Design reference: ${context.design_url}`);
  }

  // A discovery gate is present if any pipeline step carries the discovery-gate skill.
  const gatePresent = steps.some((s) => (s.skills || []).some((sk) => sk.includes('discovery-gate')));

  return { gathered, open_questions: openQuestions, gate_present: gatePresent };
}

/**
 * Suggest phases the pipeline is missing.
 * - prototype: when the scope involves UI but no design/prototype context exists
 *   and no prototype step is already in the pipeline.
 */
function buildSuggestions(context: EpicContext, steps: NormalizedStep[]): PhaseSuggestion[] {
  const suggestions: PhaseSuggestion[] = [];

  const hasPrototypeStep = steps.some((s) => s.name.toLowerCase().includes('prototype'));
  const hasDesign = !!context.design_url;

  if (scopeInvolvesUI(context.scope) && !hasDesign && !hasPrototypeStep) {
    suggestions.push({
      phase: 'prototype',
      reason: 'Scope involves UI but no design/prototype was found — add a prototype phase before implement.',
    });
  }

  return suggestions;
}

/**
 * Generate an autopilot plan for an epic.
 *
 * @param epicId epic identifier
 * @param context collected epic context
 * @param pipeline the pipeline config (steps, agents, skills)
 * @param workspace workspace config (agents, skills definitions)
 * @returns AutopilotPlan
 */
export function generatePlan(
  epicId: string,
  context: EpicContext,
  pipeline: PipelineConfig,
  workspace: WorkspaceLike,
): AutopilotPlan {
  const complexity = inferScopeComplexity(context.scope);
  const steps: NormalizedStep[] = (pipeline.steps || []).map(normalizeStep);
  const agentCountPerPhase = allocateAgentCount(complexity, steps.length);

  // Build phase allocations
  const phaseAllocations = steps.map((step) => {
    const agentId = step.agent || 'unknown';
    const agentDef = workspace.agents?.find((a) => a.id === agentId);
    const skills = step.skills || agentDef?.skills || [];

    return {
      name: step.name,
      agents: [
        {
          phase: step.name,
          agent_id: agentId,
          count: agentCountPerPhase,
          skills: skills as string[],
        },
      ],
    };
  });

  const totalAgents = phaseAllocations.length * agentCountPerPhase;

  // Extract tasks from scope description
  const extractedTasks = extractTasks(context.scope);
  const planTasks: Task[] = extractedTasks.map((desc, idx) => ({
    phase: 'implement',
    task_id: `task-${idx + 1}`,
    description: desc,
    size: desc.length > 80 ? 'large' : desc.length > 40 ? 'medium' : 'small',
  }));

  return {
    epic: epicId,
    context,
    scope_complexity: complexity,
    discovery: buildDiscovery(context, steps),
    phases: phaseAllocations,
    suggestions: buildSuggestions(context, steps),
    estimated_timeline: estimateTimeline(complexity, totalAgents),
    total_agent_count: totalAgents,
    tasks: planTasks,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Render AutopilotPlan as Markdown.
 */
export function renderPlanMarkdown(plan: AutopilotPlan): string {
  const lines: string[] = [];

  lines.push(`# aidlc-autopilot Plan: ${plan.epic}\n`);
  lines.push(`**Scope:** ${plan.context.scope}\n`);
  lines.push(`**Complexity:** ${plan.scope_complexity}\n`);
  lines.push(`**Timeline:** ${plan.estimated_timeline}\n`);
  lines.push(`**Total Agents:** ${plan.total_agent_count}\n`);

  if (plan.context.spec_url) {
    lines.push(`**Spec:** ${plan.context.spec_url}\n`);
  }

  if (plan.context.codebase_paths?.length) {
    lines.push(`**Codebase:** ${plan.context.codebase_paths.join(', ')}\n`);
  }

  if (plan.context.its_location?.length) {
    lines.push(`**Tests:** ${plan.context.its_location.join(', ')}\n`);
  }

  lines.push('\n## Discovery\n');
  lines.push(`Gate present: ${plan.discovery.gate_present ? 'yes' : 'no'}\n`);
  if (plan.discovery.gathered.length > 0) {
    lines.push('**Gathered:**');
    for (const g of plan.discovery.gathered) {
      lines.push(`- ${g}`);
    }
    lines.push('');
  }
  if (plan.discovery.open_questions.length > 0) {
    lines.push('**Open questions:**');
    for (const q of plan.discovery.open_questions) {
      lines.push(`- ${q}`);
    }
    lines.push('');
  }

  if (plan.suggestions.length > 0) {
    lines.push('\n## Suggested phases\n');
    for (const s of plan.suggestions) {
      lines.push(`- **${s.phase}** — ${s.reason}`);
    }
    lines.push('');
  }

  lines.push('\n## Phases\n');
  for (const phase of plan.phases) {
    lines.push(`### ${phase.name}`);
    for (const agent of phase.agents) {
      lines.push(`- Agent: ${agent.agent_id} (${agent.count})`);
      if (agent.skills.length > 0) {
        lines.push(`  Skills: ${agent.skills.join(', ')}`);
      }
    }
    lines.push('');
  }

  if (plan.tasks.length > 0) {
    lines.push('\n## Tasks\n');
    for (const task of plan.tasks) {
      lines.push(`- [${task.size.toUpperCase()}] ${task.description} (${task.task_id})`);
    }
    lines.push('');
  }

  lines.push(`\n_Generated: ${plan.generated_at}_`);

  return lines.join('\n');
}
