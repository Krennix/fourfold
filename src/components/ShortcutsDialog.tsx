const GROUPS: { title: string; rows: [string[], string][] }[] = [
  {
    title: 'General',
    rows: [
      [['Ctrl/⌘', 'K'], 'Command palette'],
      [['/'], 'Search'],
      [['N'], 'Quick-add a task'],
      [['F'], 'Start / pause focus timer'],
      [['T'], 'Toggle dark mode'],
      [['?'], 'Show this help'],
    ],
  },
  {
    title: 'Go to',
    rows: [
      [['G', 'H'], 'Home'],
      [['G', 'M'], 'Matrix'],
      [['G', 'C'], 'Calendar'],
      [['G', 'S'], 'School'],
      [['G', 'B'], 'Habits & Countdowns'],
      [['G', 'P'], 'Pomodoro'],
      [['G', 'F'], 'Friends'],
      [['G', 'A'], 'Assistant'],
      [['G', ','], 'Settings'],
    ],
  },
  {
    title: 'Quick-add syntax',
    rows: [
      [['tomorrow', 'fri', 'nov 20'], 'Due date'],
      [['3pm', '15:30'], 'Book a time on the calendar'],
      [['45m', '1h30m'], 'Time estimate (auto-schedules)'],
      [['!1', '!2', '!3', '!4'], 'Matrix quadrant'],
    ],
  },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="dialog-backdrop" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog" style={{ width: 'min(560px, 100%)' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="dialog-title">Keyboard shortcuts</div>
          <button className="btn btn-icon" type="button" aria-label="Close" onClick={onClose} autoFocus>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div style={{ display: 'grid', gap: 18 }}>
          {GROUPS.map((g) => (
            <div key={g.title}>
              <h6 className="text-muted" style={{ marginBottom: 8 }}>{g.title}</h6>
              <div style={{ display: 'grid', gap: 6 }}>
                {g.rows.map(([keys, label]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 13.5 }}>
                    <span>{label}</span>
                    <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {keys.map((k) => <kbd key={k}>{k}</kbd>)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
