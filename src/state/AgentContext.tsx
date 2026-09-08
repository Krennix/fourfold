import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useCalendarEvents } from './CalendarContext';
import { useMatrix } from './MatrixContext';
import { useSchoology } from './SchoologyContext';
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

interface AgentContextValue {
  chatMessages: ChatMessage[];
  isThinking: boolean;
  sendChatMessage: (text: string) => Promise<void>;
  dailyPlan: DailyPlanItem[] | null;
  isPlanning: boolean;
  generateDailyPlan: () => Promise<void>;
  acceptPlanItem: (item: DailyPlanItem) => Promise<void>;
  dismissPlanItem: (item: DailyPlanItem) => void;
  clearDailyPlan: () => void;
  watchdogFlags: WatchdogFlag[];
  checkWatchdog: () => Promise<void>;
  dismissedFlags: string[];
  dismissFlag: (flag: WatchdogFlag) => void;
}

const AgentContext = createContext<AgentContextValue | null>(null);

function flagKey(flag: WatchdogFlag): string {
  return `${flag.title}::${flag.detail}`;
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const { handleSessionExpired } = useAuth();
  const calendar = useCalendarEvents();
  const matrix = useMatrix();
  const { assignments } = useSchoology();

  const [chatMessages, setChatMessages] = useRemoteState<ChatMessage[]>('agentChat', [], handleSessionExpired);
  const [isThinking, setIsThinking] = useState(false);
  const [dailyPlan, setDailyPlan] = useRemoteState<DailyPlanItem[] | null>('dailyPlan', null, handleSessionExpired);
  const [isPlanning, setIsPlanning] = useState(false);
  const [watchdogFlags, setWatchdogFlags] = useState<WatchdogFlag[]>([]);
  const [dismissedFlags, setDismissedFlags] = useRemoteState<string[]>('watchdogDismissed', [], handleSessionExpired);

  const buildContext = useCallback((): AgentContextPayload => {
    const now = new Date();
    return {
      events: calendar.events,
      tasks: matrix.tasks,
      assignments,
      now: now.toISOString(),
    };
  }, [calendar.events, matrix.tasks, assignments]);

  const sendChatMessage = useCallback(
    async (text: string) => {
      setChatMessages((prev) => [...prev, { role: 'user', text }]);
      setIsThinking(true);
      try {
        const reply = await runAgentLoop('chat', text, buildContext(), { calendar, matrix }, handleSessionExpired);
        if (reply) setChatMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
      } catch (err) {
        setChatMessages((prev) => [...prev, { role: 'assistant', text: `Something went wrong: ${err instanceof Error ? err.message : String(err)}` }]);
      } finally {
        setIsThinking(false);
      }
    },
    [buildContext, calendar, matrix, handleSessionExpired, setChatMessages],
  );

  const generateDailyPlan = useCallback(async () => {
    setIsPlanning(true);
    try {
      const plan = await generateDailyPlanRequest(buildContext(), handleSessionExpired);
      setDailyPlan(plan);
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
    const flags = await runWatchdogRequest(buildContext(), handleSessionExpired);
    setWatchdogFlags(flags);
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
