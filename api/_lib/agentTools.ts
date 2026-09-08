import type Anthropic from '@anthropic-ai/sdk';

/** Tools Claude may call when read-only access is enough (used for watchdog mode). */
export const READ_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_calendar_events',
    description: "Get the user's calendar events, optionally filtered to a date range.",
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Inclusive start date, "YYYY-M-D" (0-based month), omit for no lower bound.' },
        to: { type: 'string', description: 'Inclusive end date, "YYYY-M-D" (0-based month), omit for no upper bound.' },
      },
    },
  },
  {
    name: 'get_tasks',
    description: 'Get the user\'s Eisenhower Matrix tasks.',
    input_schema: {
      type: 'object',
      properties: {
        quadrant: { type: 'string', enum: ['q1', 'q2', 'q3', 'q4'], description: 'q1=do now, q2=schedule, q3=delegate, q4=eliminate. Omit for all quadrants.' },
        includeDone: { type: 'boolean', description: 'Include completed tasks. Defaults to false.' },
      },
    },
  },
  {
    name: 'get_assignments',
    description: "Get the user's Schoology assignments.",
    input_schema: {
      type: 'object',
      properties: {
        dueBefore: { type: 'string', description: 'ISO date-time; only return assignments due before this.' },
      },
    },
  },
  {
    name: 'find_free_slots',
    description: 'Find open calendar slots of a given duration, avoiding existing events. Use this instead of reasoning about times manually.',
    input_schema: {
      type: 'object',
      properties: {
        durationMin: { type: 'number', description: 'Length of the slot in minutes.' },
        after: { type: 'string', description: 'ISO date-time; do not return slots before this. Defaults to now.' },
        before: { type: 'string', description: 'ISO date-time; do not return slots after this (e.g. a due date).' },
        count: { type: 'number', description: 'How many candidate slots to return. Defaults to 1.' },
      },
      required: ['durationMin'],
    },
  },
];

/** Tools that mutate calendar/task state — excluded from watchdog mode. */
export const WRITE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'create_event',
    description: 'Create a new calendar event.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: '"YYYY-M-D" with 0-based month.' },
        title: { type: 'string' },
        time: { type: 'string', description: '"HH:MM" 24-hour time.' },
        durationMin: { type: 'number' },
      },
      required: ['date', 'title', 'time'],
    },
  },
  {
    name: 'move_event',
    description: 'Move/reschedule an existing calendar event to a new date/time.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        date: { type: 'string', description: '"YYYY-M-D" with 0-based month.' },
        time: { type: 'string', description: '"HH:MM" 24-hour time.' },
      },
      required: ['id', 'date', 'time'],
    },
  },
  {
    name: 'remove_event',
    description: 'Delete a calendar event.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'create_task',
    description: 'Create a new Eisenhower Matrix task.',
    input_schema: {
      type: 'object',
      properties: {
        quadrant: { type: 'string', enum: ['q1', 'q2', 'q3', 'q4'] },
        title: { type: 'string' },
        dueDate: { type: 'string', description: 'ISO date, optional.' },
        durationMin: { type: 'number', description: 'Estimated minutes to complete, optional.' },
      },
      required: ['quadrant', 'title'],
    },
  },
  {
    name: 'schedule_task',
    description: 'Set the scheduled time-of-day on an existing task.',
    input_schema: {
      type: 'object',
      properties: {
        quadrant: { type: 'string', enum: ['q1', 'q2', 'q3', 'q4'] },
        taskId: { type: 'string' },
        time: { type: 'string', description: '"HH:MM" 24-hour time.' },
      },
      required: ['quadrant', 'taskId', 'time'],
    },
  },
  {
    name: 'unschedule_task',
    description: 'Clear the scheduled time-of-day on a task.',
    input_schema: {
      type: 'object',
      properties: {
        quadrant: { type: 'string', enum: ['q1', 'q2', 'q3', 'q4'] },
        taskId: { type: 'string' },
      },
      required: ['quadrant', 'taskId'],
    },
  },
  {
    name: 'mark_task_done',
    description: 'Toggle a task done/not-done.',
    input_schema: {
      type: 'object',
      properties: {
        quadrant: { type: 'string', enum: ['q1', 'q2', 'q3', 'q4'] },
        taskId: { type: 'string' },
      },
      required: ['quadrant', 'taskId'],
    },
  },
];

export type AgentMode = 'chat' | 'daily_plan' | 'auto_schedule' | 'watchdog';

export function toolsForMode(mode: AgentMode): Anthropic.Tool[] {
  if (mode === 'watchdog' || mode === 'daily_plan') return READ_TOOLS;
  return [...READ_TOOLS, ...WRITE_TOOLS];
}

/**
 * Static per-mode instructions — deliberately excludes anything that varies per request (like
 * the current time) so this stays byte-identical across calls and stays cacheable. The caller
 * stamps the current time onto the user turn instead; see handleLoopMode in api/agent.ts.
 */
export function systemPromptForMode(mode: AgentMode): string {
  const base = `You are Fourfold's scheduling assistant. The user's current date/time is given at the start of their message. All calendar dates use the format "YYYY-M-D" with a 0-based month (e.g. "2026-8-7" is September 7, 2026). Times are "HH:MM" 24-hour. Always use find_free_slots to find open time rather than reasoning about conflicts yourself. Events and tasks may have "locked": true, meaning the user has marked them fixed/"set in stone" — never move, reschedule, or delete a locked item (the app will refuse the action anyway); if asked to change one, tell the user it's locked and that they need to unlock it in the Calendar/Matrix UI first. Locked items still count as busy time when finding free slots for other things.`;
  switch (mode) {
    case 'chat':
      return `${base} Help the user manage their calendar, tasks, and assignments via natural language. Take action with tools when asked; ask for clarification if a request is ambiguous. Keep replies brief.`;
    case 'auto_schedule':
      return `${base} You are scheduling one specific task the user just created. Consider its priority quadrant, due date, and duration estimate, then use find_free_slots and create_event to book the best slot. Prefer sooner slots for urgent/important (q1) tasks and slots well before the deadline in general. Respond with a one-sentence confirmation of what you booked.`;
    case 'daily_plan':
      return `${base} Produce a proposed schedule for today spanning the user's unscheduled tasks, upcoming assignments, and existing calendar events. Do not call any write tools — only read tools. Respond ONLY with the structured plan output.`;
    case 'watchdog':
      return `${base} Analyze the user's calendar, tasks, and assignments for problems: overdue-risk assignments (due soon with no time budgeted), double-bookings/conflicts, and unrealistic workloads (too much scheduled in too little time). Do not call any write tools — only read tools. Respond ONLY with the structured flags output.`;
  }
}

export const DAILY_PLAN_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          time: { type: 'string', description: '"HH:MM" 24-hour time.' },
          title: { type: 'string' },
          sourceType: { type: 'string', enum: ['task', 'assignment', 'event'] },
          sourceId: { type: 'string' },
          durationMin: { type: 'number' },
          rationale: { type: 'string' },
        },
        required: ['time', 'title', 'sourceType', 'sourceId', 'durationMin', 'rationale'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

export const WATCHDOG_SCHEMA = {
  type: 'object',
  properties: {
    flags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
          title: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['severity', 'title', 'detail'],
        additionalProperties: false,
      },
    },
  },
  required: ['flags'],
  additionalProperties: false,
} as const;
