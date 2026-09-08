import './StreakFire.css';

export function StreakFire({ streak, done }: { streak: number; done: boolean }) {
  return (
    <span className={`streak-fire${done ? ' lit' : ''}`}>
      <svg className="streak-fire-icon" viewBox="0 0 24 24" fill="none">
        <path
          className="streak-fire-outer"
          d="M12.6 1.6c.9 2.8-.4 4.2-1.9 5.9-1.7 1.9-3.5 4-3.5 7.1a5.8 5.8 0 0 0 11.6 0c0-2.5-1-4.2-2.2-5.7-.2 1.6-1 2.7-2 2.7-1.2 0-1.8-1.2-1.3-2.5.8-2 .9-4.6-.7-7.5Z"
        />
        <path
          className="streak-fire-inner"
          d="M12.2 12c.5-.6.7-1.3.5-2.1-1 .4-1.3 1.3-2 2.1-.7.8-1.1 1.9-.5 2.9a2.5 2.5 0 0 0 4.6-1.3c0-.9-.5-1.6-1.2-2 .1.6-.2 1.1-.7 1.1-.4 0-.9-.2-.7-.7Z"
        />
      </svg>
      <span className="streak-fire-count">{streak}</span>
    </span>
  );
}
