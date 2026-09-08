import { useEffect, useRef, useState } from 'react';
import { Widget, PageHeader } from '../components/Widget';
import { useAgent } from '../state/AgentContext';
import './Agent.css';

export function AgentPage() {
  const {
    chatMessages,
    isThinking,
    sendChatMessage,
    dailyPlan,
    isPlanning,
    generateDailyPlan,
    acceptPlanItem,
    dismissPlanItem,
    clearDailyPlan,
    watchdogFlags,
    checkWatchdog,
    dismissFlag,
  } = useAgent();

  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chatMessages, isThinking]);

  useEffect(() => {
    void checkWatchdog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isThinking) return;
    setInput('');
    void sendChatMessage(text);
  };

  return (
    <div className="page">
      <PageHeader kicker="AI scheduling agent" title="Assistant" />

      {watchdogFlags.length > 0 && (
        <Widget style={{ marginBottom: 'var(--space-6)' }}>
          <div className="widget-head">
            <h4>Flags</h4>
          </div>
          {watchdogFlags.map((f) => (
            <div className={`watchdog-flag watchdog-${f.severity}`} key={`${f.title}-${f.detail}`}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{f.title}</div>
                <div className="text-muted" style={{ fontSize: 12 }}>{f.detail}</div>
              </div>
              <button className="btn btn-ghost" type="button" style={{ fontSize: 12 }} onClick={() => dismissFlag(f)}>
                Dismiss
              </button>
            </div>
          ))}
        </Widget>
      )}

      <div className="agent-grid">
        <Widget style={{ minHeight: 0 }}>
          <div className="widget-head">
            <h4>Plan my day</h4>
            {!dailyPlan && (
              <button className="btn btn-secondary" type="button" onClick={() => void generateDailyPlan()} disabled={isPlanning}>
                {isPlanning ? 'Thinking…' : 'Generate'}
              </button>
            )}
            {dailyPlan && (
              <button className="btn btn-ghost" type="button" style={{ fontSize: 12 }} onClick={clearDailyPlan}>
                Clear
              </button>
            )}
          </div>
          {!dailyPlan && <div className="text-muted" style={{ fontSize: 12 }}>Generate a proposed schedule from your tasks, assignments, and calendar.</div>}
          {dailyPlan?.length === 0 && <div className="text-muted" style={{ fontSize: 12 }}>Nothing to plan — you're clear today.</div>}
          {dailyPlan?.map((item) => (
            <div className="plan-item" key={`${item.sourceType}-${item.sourceId}-${item.time}`}>
              <span className="event-time">{item.time}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14 }}>{item.title}</div>
                <div className="text-muted" style={{ fontSize: 11 }}>{item.rationale}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
                <button className="btn btn-icon" type="button" title="Accept" onClick={() => void acceptPlanItem(item)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </button>
                <button className="btn btn-icon" type="button" title="Dismiss" onClick={() => dismissPlanItem(item)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          ))}
        </Widget>

        <Widget style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="widget-head">
            <h4>Chat</h4>
          </div>
          <div className="agent-chat-list" ref={listRef}>
            {chatMessages.length === 0 && <div className="text-muted" style={{ fontSize: 12 }}>Ask about your day, or tell it to move/add something.</div>}
            {chatMessages.map((m, i) => (
              <div className={`agent-msg agent-msg-${m.role}`} key={i}>{m.text}</div>
            ))}
            {isThinking && <div className="agent-msg agent-msg-assistant text-muted">Thinking…</div>}
          </div>
          <form className="agent-input-row" onSubmit={submit}>
            <input
              className="agent-input"
              placeholder="What's my day look like?"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button className="btn btn-primary" type="submit" disabled={isThinking || !input.trim()}>
              Send
            </button>
          </form>
        </Widget>
      </div>
    </div>
  );
}
