import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { verifySession } from './_lib/session.js';
import { findFreeSlots, type AgentCalEvent } from './_lib/scheduling.js';
import { toolsForMode, systemPromptForMode, DAILY_PLAN_SCHEMA, WATCHDOG_SCHEMA, type AgentMode } from './_lib/agentTools.js';

const MODEL = 'claude-sonnet-5';
const MAX_ITERATIONS = 6;
const READ_ONLY_TOOLS = new Set(['get_calendar_events', 'get_tasks', 'get_assignments', 'find_free_slots']);

interface AgentTask {
  id: string;
  title: string;
  done: boolean;
  time: string | null;
  dueDate: string | null;
  durationMin: number | null;
}

interface AgentAssignment {
  uid: string;
  title: string;
  description: string | null;
  due: string;
  allDay: boolean;
}

interface AgentContextPayload {
  events: AgentCalEvent[];
  tasks: Record<'q1' | 'q2' | 'q3' | 'q4', AgentTask[]>;
  assignments: AgentAssignment[];
  now: string;
}

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

const client = new Anthropic();

function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

function executeReadTool(name: string, input: Record<string, unknown>, context: AgentContextPayload): unknown {
  switch (name) {
    case 'get_calendar_events': {
      const from = typeof input.from === 'string' ? input.from : null;
      const to = typeof input.to === 'string' ? input.to : null;
      return context.events.filter((e) => (!from || e.date >= from) && (!to || e.date <= to));
    }
    case 'get_tasks': {
      const quadrant = typeof input.quadrant === 'string' ? (input.quadrant as keyof AgentContextPayload['tasks']) : null;
      const includeDone = input.includeDone === true;
      const quads = quadrant ? [quadrant] : (['q1', 'q2', 'q3', 'q4'] as const);
      const result: Record<string, AgentTask[]> = {};
      for (const q of quads) result[q] = context.tasks[q].filter((t) => includeDone || !t.done);
      return result;
    }
    case 'get_assignments': {
      const dueBefore = typeof input.dueBefore === 'string' ? input.dueBefore : null;
      return context.assignments.filter((a) => !dueBefore || a.due < dueBefore);
    }
    case 'find_free_slots': {
      const durationMin = typeof input.durationMin === 'number' ? input.durationMin : 30;
      const count = typeof input.count === 'number' ? input.count : 1;
      const after = typeof input.after === 'string' ? new Date(input.after) : new Date(context.now);
      const before = typeof input.before === 'string' ? new Date(input.before) : undefined;
      const slots = findFreeSlots(context.events, durationMin, count, { after, before });
      return slots.map((s) => ({
        date: `${s.getFullYear()}-${s.getMonth()}-${s.getDate()}`,
        time: `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`,
      }));
    }
    default:
      return { error: `Unknown read tool: ${name}` };
  }
}

async function handleLoopMode(
  mode: 'chat' | 'auto_schedule',
  context: AgentContextPayload,
  message: string | undefined,
  priorMessages: Anthropic.MessageParam[],
  pendingToolResults: Anthropic.ToolResultBlockParam[] | undefined,
  res: VercelResponse,
) {
  let messages = priorMessages;
  if (pendingToolResults) {
    messages = [...messages, { role: 'user', content: pendingToolResults }];
  } else if (message) {
    messages = [...messages, { role: 'user', content: message }];
  }

  const tools = toolsForMode(mode);
  const system = systemPromptForMode(mode, context.now);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system,
      tools,
      thinking: { type: 'adaptive' },
      output_config: { effort: mode === 'auto_schedule' ? 'medium' : 'low' },
      messages,
    });
    messages = [...messages, { role: 'assistant', content: response.content }];

    if (response.stop_reason === 'pause_turn') continue;
    if (response.stop_reason !== 'tool_use') {
      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
      res.status(200).json({ messages, reply: textBlock?.text ?? '', done: true });
      return;
    }

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const writeCalls: ToolCall[] = [];
    const readResults: Anthropic.ToolResultBlockParam[] = [];
    for (const t of toolUses) {
      const input = t.input as Record<string, unknown>;
      if (READ_ONLY_TOOLS.has(t.name)) {
        readResults.push({ type: 'tool_result', tool_use_id: t.id, content: JSON.stringify(executeReadTool(t.name, input, context)) });
      } else {
        writeCalls.push({ id: t.id, name: t.name, input });
      }
    }

    if (writeCalls.length > 0) {
      res.status(200).json({ messages, pendingToolCalls: writeCalls, pendingReadResults: readResults, done: false });
      return;
    }

    messages = [...messages, { role: 'user', content: readResults }];
  }

  res.status(200).json({ messages, reply: "I wasn't able to finish that — try rephrasing or breaking it into smaller steps.", done: true });
}

async function handleDailyPlan(context: AgentContextPayload, res: VercelResponse) {
  const system = systemPromptForMode('daily_plan', context.now);
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    system,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: jsonSchemaOutputFormat(DAILY_PLAN_SCHEMA) },
    messages: [{ role: 'user', content: `Here is the user's current data as JSON:\n${JSON.stringify(context)}\n\nGenerate today's plan.` }],
  });
  res.status(200).json({ plan: response.parsed_output?.items ?? [], done: true });
}

async function handleWatchdog(context: AgentContextPayload, res: VercelResponse) {
  const system = systemPromptForMode('watchdog', context.now);
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    system,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: jsonSchemaOutputFormat(WATCHDOG_SCHEMA) },
    messages: [{ role: 'user', content: `Here is the user's current data as JSON:\n${JSON.stringify(context)}\n\nFlag any problems.` }],
  });
  res.status(200).json({ flags: response.parsed_output?.flags ?? [], done: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const email = verifySession(bearerToken(req));
  if (!email) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body ?? {};
  const mode = body.mode as AgentMode;
  const context = body.context as AgentContextPayload | undefined;
  if (!context || !['chat', 'daily_plan', 'auto_schedule', 'watchdog'].includes(mode)) {
    res.status(400).json({ error: 'Invalid request.' });
    return;
  }

  try {
    if (mode === 'daily_plan') {
      await handleDailyPlan(context, res);
      return;
    }
    if (mode === 'watchdog') {
      await handleWatchdog(context, res);
      return;
    }
    const priorMessages = (body.messages as Anthropic.MessageParam[]) ?? [];
    const pendingToolResults = body.pendingToolResults as Anthropic.ToolResultBlockParam[] | undefined;
    const message = typeof body.message === 'string' ? body.message : undefined;
    await handleLoopMode(mode, context, message, priorMessages, pendingToolResults, res);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Agent request failed.' });
  }
}
