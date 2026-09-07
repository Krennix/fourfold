import './StreakFire.css';

export function StreakFire({ streak, done }: { streak: number; done: boolean }) {
  return (
    <span className={`streak-fire${done ? ' lit' : ''}`}>
      <svg className="streak-fire-icon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-2-1-3-1-3s2 1 2 4a5 5 0 0 1-10 0c0-5 4-6 4-10z" />
      </svg>
      <span className="streak-fire-count">{streak}</span>
    </span>
  );
}
