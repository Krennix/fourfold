import type { ReactNode } from 'react';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

export const navItems: NavItem[] = [
  {
    to: '/',
    label: 'Home',
    icon: (
      <>
        <path d="M3 9.5 12 3l9 6.5" />
        <path d="M5 9v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9" />
      </>
    ),
  },
  {
    to: '/matrix',
    label: 'Matrix',
    icon: (
      <>
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </>
    ),
  },
  {
    to: '/habits',
    label: 'Habits & Countdowns',
    icon: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  },
  {
    to: '/calendar',
    label: 'Calendar',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </>
    ),
  },
  {
    to: '/friends',
    label: 'Friends',
    icon: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6" />
        <path d="M16.5 8.5a3 3 0 1 1 0-5.98" />
        <path d="M18.5 14c2.5.5 4 2.5 4 6" />
      </>
    ),
  },
  {
    to: '/pomodoro',
    label: 'Pomodoro',
    icon: (
      <>
        <path d="M10 2h4" />
        <path d="M12 14v-4" />
        <circle cx="12" cy="14" r="8" />
      </>
    ),
  },
  {
    to: '/school',
    label: 'School',
    icon: (
      <>
        <path d="m22 10-10-5L2 10l10 5 10-5Z" />
        <path d="M6 12v5c0 1.1 2.7 2 6 2s6-.9 6-2v-5" />
      </>
    ),
  },
  {
    to: '/agent',
    label: 'Assistant',
    icon: (
      <>
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
      </>
    ),
  },
];
