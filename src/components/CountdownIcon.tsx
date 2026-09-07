import type { CountdownType } from '../state/CountdownsContext';

export const COUNTDOWN_TYPES: CountdownType[] = ['birthday', 'holiday', 'anniversary', 'deadline', 'event'];

export const COUNTDOWN_TYPE_LABELS: Record<CountdownType, string> = {
  birthday: 'Birthday',
  holiday: 'Holiday',
  anniversary: 'Anniversary',
  deadline: 'Deadline',
  event: 'Event',
};

const PATHS: Record<CountdownType, React.ReactNode> = {
  birthday: (
    <>
      <path d="M12 2v3" />
      <path d="M12 5c-1 0-1.5.75-1.5 1.5S11 8 12 8s1.5-.75 1.5-1.5S13 5 12 5Z" />
      <path d="M4 21v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6" />
      <path d="M4 21h16" />
      <path d="M4 17c1 1 2 1 3 0s2-1 3 0 2 1 3 0 2-1 3 0 2 1 3 0" />
    </>
  ),
  holiday: (
    <>
      <rect x="4" y="8" width="16" height="12" rx="1" />
      <path d="M4 12h16" />
      <path d="M12 8v12" />
      <path d="M12 8C10.5 8 9 7 9 5.5S10 3 11.5 3 12 4.8 12 6" />
      <path d="M12 8c1.5 0 3-1 3-2.5S14 3 12.5 3 12 4.8 12 6" />
    </>
  ),
  anniversary: (
    <path d="M12 21s-7-4.35-9.5-9C1 8.5 2 5 5.5 5c2 0 3.5 1.2 4.5 2.5C11 6.2 12.5 5 14.5 5 18 5 19 8.5 17.5 12 15 16.65 12 21 12 21Z" />
  ),
  deadline: (
    <>
      <path d="M5 3v18" />
      <path d="M5 4h13l-3 4 3 4H5" />
    </>
  ),
  event: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="m12 13.5 1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5 2.2-.3Z" />
    </>
  ),
};

export function CountdownIcon({ type, className }: { type: CountdownType; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[type]}
    </svg>
  );
}
