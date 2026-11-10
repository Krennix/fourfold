import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { navItems } from '../lib/navItems';
import { Icon } from './Icon';
import { parseQuickAdd } from '../lib/quickAdd';
import { useUI, type PaletteMode } from '../state/UIContext';
import { useMatrix, type QuadKey } from '../state/MatrixContext';
import { useHabits } from '../state/HabitsContext';
import { useCountdowns } from '../state/CountdownsContext';
import { useFriends } from '../state/FriendsContext';
import { useCalendarEvents } from '../state/CalendarContext';
import { usePomodoro } from '../state/PomodoroContext';
import { useAgent } from '../state/AgentContext';
import './CommandPalette.css';

interface PaletteItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  keywords?: string;
  chips?: string[];
  run: () => void | Promise<void>;
}

function score(item: PaletteItem, q: string): number {
  if (!q) return 1;
  const hay = `${item.label} ${item.keywords ?? ''} ${item.group}`.toLowerCase();
  const label = item.label.toLowerCase();
  if (label.startsWith(q)) return 100;
  if (label.includes(` ${q}`)) return 80;
  if (hay.includes(q)) return 60;
  // loose subsequence match
  let i = 0;
  for (const ch of hay) if (ch === q[i]) i++;
  return i === q.length ? 20 : 0;
}

const QUAD_NAMES: Record<QuadKey, string> = { q1: 'Do first', q2: 'Schedule', q3: 'Delegate', q4: 'Eliminate' };

export function CommandPalette({ mode, initialQuery, onClose }: { mode: PaletteMode; initialQuery: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { quickAddTask, openTaskDialog, openCountdownDialog, openShortcuts, toggleTheme, toast } = useUI();
  const { tasks, toggleDone } = useMatrix();
  const { habits, toggleHabit } = useHabits();
  const { countdowns } = useCountdowns();
  const { friends } = useFriends();
  const { events } = useCalendarEvents();
  const pomodoro = usePomodoro();
  const { sendChatMessage, generateDailyPlan } = useAgent();
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  const parsed = useMemo(() => parseQuickAdd(query), [query]);

  const items = useMemo<PaletteItem[]>(() => {
    const go = (to: string) => () => navigate(to);
    const out: PaletteItem[] = [];

    if (mode === 'task' || q) {
      if (parsed.title) {
        out.push({
          id: 'create-task',
          group: 'Create',
          label: `Add task “${parsed.title}”`,
          chips: parsed.chips.map((c) => c.label),
          icon: <Icon name="plus" />,
          keywords: query,
          run: async () => {
            await quickAddTask(query);
          },
        });
      }
    }
    if (mode === 'task') return out;

    if (q.length > 1) {
      out.push({
        id: 'ask-assistant',
        group: 'Create',
        label: `Ask the assistant “${query.trim()}”`,
        icon: <Icon name="sparkles" />,
        keywords: query,
        run: () => {
          navigate('/agent');
          void sendChatMessage(query.trim());
        },
      });
    }

    out.push(
      { id: 'act-task', group: 'Actions', label: 'New task…', hint: 'N', icon: <Icon name="plus" />, keywords: 'add create todo', run: () => openTaskDialog('q2') },
      {
        id: 'act-focus',
        group: 'Actions',
        label: pomodoro.isRunning ? 'Pause focus timer' : 'Start a 25-minute focus session',
        hint: 'F',
        icon: <Icon name="timer" />,
        keywords: 'pomodoro timer focus start pause',
        run: () => (pomodoro.isRunning ? pomodoro.toggleRun() : pomodoro.start()),
      },
      { id: 'act-plan', group: 'Actions', label: 'Plan my day with the assistant', icon: <Icon name="sparkles" />, keywords: 'ai schedule agent daily', run: () => { navigate('/agent'); void generateDailyPlan(); } },
      { id: 'act-countdown', group: 'Actions', label: 'Add countdown…', icon: <Icon name="flag" />, keywords: 'birthday deadline event holiday', run: () => openCountdownDialog() },
      { id: 'act-theme', group: 'Actions', label: 'Toggle dark mode', hint: 'T', icon: <Icon name="moon" />, keywords: 'theme light dark appearance', run: toggleTheme },
      { id: 'act-shortcuts', group: 'Actions', label: 'Keyboard shortcuts', hint: '?', icon: <Icon name="keyboard" />, keywords: 'help keys hotkeys', run: openShortcuts },
    );

    for (const n of navItems) {
      out.push({ id: `nav-${n.to}`, group: 'Go to', label: n.label, hint: n.shortcut ? `G ${n.shortcut.toUpperCase()}` : undefined, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{n.icon}</svg>, keywords: n.keywords, run: go(n.to) });
    }
    out.push(
      { id: 'nav-weekly', group: 'Go to', label: 'Weekly review', icon: <Icon name="chart" />, keywords: 'stats review week', run: go('/calendar?tab=weekly') },
      { id: 'nav-settings', group: 'Go to', label: 'Settings', hint: 'G ,', icon: <Icon name="settings" />, keywords: 'preferences account integrations', run: go('/settings') },
    );

    // Searchable content only once the user types something.
    if (q) {
      for (const quad of ['q1', 'q2', 'q3', 'q4'] as QuadKey[]) {
        for (const t of tasks[quad]) {
          if (t.done) continue;
          out.push({
            id: `task-${t.id}`,
            group: 'Tasks',
            label: t.title,
            hint: 'Complete',
            icon: <Icon name="circle" />,
            keywords: `${QUAD_NAMES[quad]} task ${t.description}`,
            run: () => {
              toggleDone(quad, t.id);
              toast({ message: `Completed “${t.title}”`, tone: 'success', action: { label: 'Undo', onClick: () => toggleDone(quad, t.id) } });
            },
          });
        }
      }
      for (const h of habits) {
        out.push({
          id: `habit-${h.id}`,
          group: 'Habits',
          label: h.name,
          hint: h.done ? 'Undo today' : 'Check off today',
          icon: <Icon name={h.done ? 'check-circle' : 'circle'} />,
          keywords: 'habit',
          run: () => {
            toggleHabit(h.id);
            if (!h.done) toast({ message: `Nice — “${h.name}” done for today`, tone: 'success' });
          },
        });
      }
      for (const c of countdowns) {
        out.push({ id: `cd-${c.id}`, group: 'Countdowns', label: c.name, icon: <Icon name="flag" />, keywords: `countdown ${c.type}`, run: go('/habits') });
      }
      for (const f of friends) {
        out.push({ id: `friend-${f.id}`, group: 'Friends', label: f.name, hint: f.nickname, icon: <Icon name="user" />, keywords: `friend ${f.nickname ?? ''}`, run: go('/friends') });
      }
      const seen = new Set<string>();
      for (const e of events) {
        if (seen.has(e.title) || seen.size > 200) continue;
        seen.add(e.title);
        out.push({ id: `ev-${e.id}-${e.date}`, group: 'Events', label: e.title, hint: e.time, icon: <Icon name="calendar" />, keywords: 'event calendar', run: go('/calendar') });
      }
    }
    return out;
  }, [mode, q, query, parsed, navigate, quickAddTask, sendChatMessage, openTaskDialog, pomodoro, generateDailyPlan, openCountdownDialog, toggleTheme, openShortcuts, tasks, toggleDone, toast, habits, toggleHabit, countdowns, friends, events]);

  const filtered = useMemo(() => {
    const pinned = items.filter((i) => i.group === 'Create');
    const rest = items
      .filter((i) => i.group !== 'Create')
      .map((i) => ({ i, s: score(i, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, q ? 30 : 50)
      .map((x) => x.i);
    // With a query, show strong matches above the "Create" fallbacks.
    if (!q) return [...pinned, ...rest];
    const strong = rest.filter((i) => score(i, q) >= 80);
    const weak = rest.filter((i) => score(i, q) < 80);
    return [...strong, ...pinned, ...weak];
  }, [items, q]);

  const clampedActive = Math.min(active, Math.max(0, filtered.length - 1));

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${clampedActive}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [clampedActive]);

  const runItem = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    void item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(filtered.length - 1, Math.min(a, filtered.length - 1) + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, Math.min(a, filtered.length - 1) - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runItem(filtered[clampedActive]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = '';
  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label={mode === 'task' ? 'Quick add task' : 'Command palette'} onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input-row">
          <Icon name={mode === 'task' ? 'plus' : 'search'} />
          <input
            ref={inputRef}
            className="palette-input"
            placeholder={mode === 'task' ? 'Add a task — try “Essay tomorrow 3pm 45m !1”' : 'Search, jump to a page, or type a task…'}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            aria-activedescendant={filtered[clampedActive] ? `pal-${filtered[clampedActive].id}` : undefined}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" ref={listRef} role="listbox">
          {filtered.length === 0 && (
            <div className="palette-empty">
              {mode === 'task' ? (
                <>
                  <strong>Type a task to add it.</strong>
                  <span>
                    Add a date (<code>tomorrow</code>, <code>fri</code>, <code>nov 20</code>), a time (<code>3pm</code>), a length
                    (<code>45m</code>) or a priority (<code>!1</code>–<code>!4</code>).
                  </span>
                </>
              ) : (
                <span>No matches.</span>
              )}
            </div>
          )}
          {filtered.map((item, idx) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {header && <div className="palette-group">{header}</div>}
                <div
                  id={`pal-${item.id}`}
                  data-index={idx}
                  role="option"
                  aria-selected={idx === clampedActive}
                  className={`palette-item${idx === clampedActive ? ' active' : ''}`}
                  onMouseMove={() => idx !== clampedActive && setActive(idx)}
                  onClick={() => runItem(item)}
                >
                  <span className="palette-item-icon">{item.icon}</span>
                  <span className="palette-item-label">{item.label}</span>
                  {item.chips && item.chips.length > 0 && (
                    <span className="palette-chips">
                      {item.chips.map((c) => (
                        <span className="tag tag-accent" key={c}>{c}</span>
                      ))}
                    </span>
                  )}
                  {item.hint && <span className="palette-item-hint">{item.hint}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          {mode !== 'task' && <span className="palette-footer-tip">Tip: type a task like “Call mom sat 6pm” and press ↵</span>}
        </div>
      </div>
    </div>
  );
}
