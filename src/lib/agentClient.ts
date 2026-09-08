import { getStoredSession } from '../state/AuthContext';
import { executeWriteTool, type AgentToolDeps, type AgentToolCall } from './agentTools';
import type { CalEvent } from '../state/CalendarContext';
import type { QuadKey, Task } from '../state/MatrixContext';
import type { SchoologyAssignment } from '../state/SchoologyContext';

export type AgentMode = 'chat' | 'daily_plan' | 'auto_schedule' | 'watchdog';

export interface AgentContextPayload {
  events: CalEvent[];
  tasks: Record<QuadKey, Task[]>;
  assignments: SchoologyAssignment[];
  now: string;
}

export interface DailyPlanItem {
  time: string;
  title: string;
  sourceType: 'task' | 'assignment' | 'event';
  sourceId: string;
  durationMin: number;
  rationale: string;
}

export interface WatchdogFlag {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
}

interface AgentResponse {
  messages?: unknown[];
  reply?: string;
  pendingToolCalls?: AgentToolCall[];
  pendingReadResults?: { type: 'tool_result'; tool_use_id: string; content: string }[];
  plan?: DailyPlanItem[];
  flags?: WatchdogFlag[];
  done?: boolean;
  error?: string;
}

async function callAgent(body: Record<string, unknown>, onExpired: () => void): Promise<AgentResponse | null> {
  const session = getStoredSession();
  if (!session) {
    onExpired();
    return null;
  }
  const res = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    onExpired();
    return null;
  }
  const json = (await res.json()) as AgentResponse;
  if (!res.ok) throw new Error(json.error ?? 'Agent request failed.');
  return json;
}

/**
 * Drives the resumable chat/auto-schedule tool loop: the server executes read tools itself
 * (they only need the bundled context) and pauses whenever Claude requests a write tool, since
 * those must run against the real Calendar/Matrix state which only exists in the browser.
 */
export async function runAgentLoop(
  mode: 'chat' | 'auto_schedule',
  message: string | undefined,
  context: AgentContextPayload,
  deps: AgentToolDeps,
  onExpired: () => void,
): Promise<string> {
  let payload: Record<string, unknown> = { mode, message, context, messages: [] };

  for (;;) {
    const response = await callAgent(payload, onExpired);
    if (!response) return '';

    if (response.done) return response.reply ?? '';

    const writeResults = await Promise.all(
      (response.pendingToolCalls ?? []).map(async (call) => ({
        type: 'tool_result' as const,
        tool_use_id: call.id,
        content: JSON.stringify(await executeWriteTool(call, deps)),
      })),
    );

    payload = {
      mode,
      context,
      messages: response.messages,
      pendingToolResults: [...(response.pendingReadResults ?? []), ...writeResults],
    };
  }
}

export async function generateDailyPlan(context: AgentContextPayload, onExpired: () => void): Promise<DailyPlanItem[]> {
  const response = await callAgent({ mode: 'daily_plan', context }, onExpired);
  return response?.plan ?? [];
}

export async function runWatchdog(context: AgentContextPayload, onExpired: () => void): Promise<WatchdogFlag[]> {
  const response = await callAgent({ mode: 'watchdog', context }, onExpired);
  return response?.flags ?? [];
}
