import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useCalendarEvents } from './CalendarContext';
import { useMatrix } from './MatrixContext';
import { useSchoology } from './SchoologyContext';
import { useCanvas } from './CanvasContext';
import { useClassroom } from './ClassroomContext';
import { useRemoteState } from '../lib/remoteStore';
import {
  runAgentLoop,
  generateDailyPlan as generateDailyPlanRequest,
  runWatchdog as runWatchdogRequest,
  type AgentContextPayload,
  type DailyPlanItem,
  type WatchdogFlag,
} from '../lib/agentClient';
import { executeWriteTool } from '../lib/agentTools';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

/** Chat is stored alongside the local day it was started on, so it can be wiped at local midnight. */
interface ChatState {
  day: string;
  messages: ChatMessage[];
}

const EMPTY_CHAT: ChatState = { day: '', messages: [] };

interface AgentContextValue {
  chatMessages: ChatMessage[];
  isThinking: boolean;
  sendChatMessage: (text: string) => Promise<void>;
  dailyPlan: DailyPlanItem[] | null;
  isPlanning: boolean;
  generateDailyPlan: () => Promise<void>;
  /** Last daily-plan failure (e.g. the assistant isn't configured), cleared on retry. */
  planError: string | null;
  acceptPlanItem: (item: DailyPlanItem) => Promise<void>;
  dismissPlanItem: (item: DailyPlanItem) => void;
  clearDailyPlan: () => void;
  watchdogFlags: WatchdogFlag[];
  checkWatchdog: () => Promise<void>;
  dismissedFlags: string[];
  dismissFlag: (flag: WatchdogFlag) => void;
}

const AgentContext = createContext<AgentContextValue | null>(null);

/** Local wall-clock time as ISO without an offset (e.g. "2026-11-10T14:05:00"), plus the zone for
 * the model's benefit — calendar events are wall-clock too, so the server must not see UTC. */
function localIsoString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  return `${iso} (${weekday}, local time)`;
}

function flagKey(flag: WatchdogFlag): string {
  return `${flag.title}::${flag.detail}`;
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const { handleSessionExpired } = useAuth();
  const calendar = useCalendarEvents();
  const matrix = useMatrix();
  const { assignments: schoologyAssignments } = useSchoology();
  const { assignments: canvasAssignments } = useCanvas();
  const { assignments: classroomAssignments } = useClassroom();
  const assignments = useMemo(
    () => [...schoologyAssignments, ...canvasAssignments, ...classroomAssignments],
    [schoologyAssignments, canvasAssignments, classroomAssignments],
  );

  const [chatState, setChatState] = useRemoteState<ChatState>('agentChat', EMPTY_CHAT, handleSessionExpired);
  const [isThinking, setIsThinking] = useState(false);
  const [dailyPlan, setDailyPlan] = useRemoteState<DailyPlanItem[] | null>('dailyPlan', null, handleSessionExpired);
  const [isPlanning, setIsPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [watchdogFlags, setWatchdogFlags] = useState<WatchdogFlag[]>([]);
  const [dismissedFlags, setDismissedFlags] = useRemoteState<string[]>('watchdogDismissed', [], handleSessionExpired);

  const buildContext = useCallback((): AgentContextPayload => {
    const now = new Date();
    return {
      events: calendar.events,
      tasks: matrix.tasks,
      assignments,
      now: localIsoString(now),
    };
  }, [calendar.events, matrix.tasks, assignments]);

  // Re-render at least once a minute so `todayKey` below notices a local-midnight rollover
  // even if the tab is just sitting open with nothing else triggering a render.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const todayKey = dateKeyForToday();
  const chatMessages = chatState.day === todayKey ? chatState.messages : [];

  // Persist the wipe once we notice the day has rolled over — `chatMessages` above already
  // renders empty immediately, this just makes the clear stick in remote storage.
  useEffect(() => {
    if (chatState.day !== todayKey) setChatState({ day: todayKey, messages: [] });
  }, [chatState.day, todayKey, setChatState]);

  const appendChatMessage = useCallback(
    (message: ChatMessage) => {
      setChatState((prev) => ({
        day: todayKey,
        messages: [...(prev.day === todayKey ? prev.messages : []), message],
      }));
    },
    [todayKey, setChatState],
  );

  const sendChatMessage = useCallback(
    async (text: string) => {
      appendChatMessage({ role: 'user', text });
      setIsThinking(true);
      try {
        const reply = await runAgentLoop('chat', text, buildContext(), { calendar, matrix }, handleSessionExpired);
        if (reply) appendChatMessage({ role: 'assistant', text: reply });
      } catch (err) {
        appendChatMessage({ role: 'assistant', text: `Something went wrong: ${err instanceof Error ? err.message : String(err)}` });
      } finally {
        setIsThinking(false);
      }
    },
    [appendChatMessage, buildContext, calendar, matrix, handleSessionExpired],
  );

  const generateDailyPlan = useCallback(async () => {
    setIsPlanning(true);
    try {
      setPlanError(null);
      const plan = await generateDailyPlanRequest(buildContext(), handleSessionExpired);
      setDailyPlan(plan);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Could not plan your day.');
    } finally {
      setIsPlanning(false);
    }
  }, [buildContext, handleSessionExpired, setDailyPlan]);

  const acceptPlanItem = useCallback(
    async (item: DailyPlanItem) => {
      if (item.sourceType === 'task') {
        await executeWriteTool({ id: '', name: 'schedule_task', input: { quadrant: findTaskQuad(matrix.tasks, item.sourceId), taskId: item.sourceId, time: item.time } }, { calendar, matrix });
      } else if (item.sourceType !== 'event') {
        await calendar.addEvent(dateKeyForToday(), item.title, item.time, item.durationMin);
      }
      setDailyPlan((prev) => (prev ? prev.filter((p) => p !== item) : prev));
    },
    [calendar, matrix, setDailyPlan],
  );

  const dismissPlanItem = useCallback(
    (item: DailyPlanItem) => {
      setDailyPlan((prev) => (prev ? prev.filter((p) => p !== item) : prev));
    },
    [setDailyPlan],
  );

  const clearDailyPlan = useCallback(() => setDailyPlan(null), [setDailyPlan]);

  const checkWatchdog = useCallback(async () => {
    try {
      const flags = await runWatchdogRequest(buildContext(), handleSessionExpired);
      setWatchdogFlags(flags);
    } catch {
      // Background check — the assistant may simply not be configured; stay quiet.
    }
  }, [buildContext, handleSessionExpired]);

  const dismissFlag = useCallback(
    (flag: WatchdogFlag) => {
      setDismissedFlags((prev) => [...prev, flagKey(flag)]);
    },
    [setDismissedFlags],
  );

  const visibleFlags = watchdogFlags.filter((f) => !dismissedFlags.includes(flagKey(f)));

  return (
    <AgentContext.Provider
      value={{
        chatMessages,
        isThinking,
        planError,
        sendChatMessage,
        dailyPlan,
        isPlanning,
        generateDailyPlan,
        acceptPlanItem,
        dismissPlanItem,
        clearDailyPlan,
        watchdogFlags: visibleFlags,
        checkWatchdog,
        dismissedFlags,
        dismissFlag,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}

function findTaskQuad(tasks: Record<string, { id: string }[]>, taskId: string): 'q1' | 'q2' | 'q3' | 'q4' {
  for (const q of ['q1', 'q2', 'q3', 'q4'] as const) {
    if (tasks[q].some((t) => t.id === taskId)) return q;
  }
  return 'q2';
}

function dateKeyForToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
}

export function useAgent() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error('useAgent must be used within an AgentProvider');
  return ctx;
}
