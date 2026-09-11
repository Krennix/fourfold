import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTheme } from '../state/ThemeContext';
import { Logo } from './Logo';
import './Sidebar.css';

const COLLAPSE_KEY = 'sidebar-collapsed';
const MOBILE_QUERY = '(max-width: 768px)';

const navItems = [
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
    to: '/weekly-review',
    label: 'Weekly Review',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
        <path d="m9 16 2 2 4-4" />
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

function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const label = isDark ? 'Light mode' : 'Dark mode';

  return (
    <button
      type="button"
      className="side-link theme-toggle"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={collapsed ? label : undefined}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {isDark ? (
          <circle cx="12" cy="12" r="4.5" />
        ) : (
          <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
        )}
        {isDark && (
          <>
            <path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
          </>
        )}
      </svg>
      {!collapsed && label}
    </button>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      // ignore storage errors (private browsing, etc.)
    }
  }, [collapsed]);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const handler = () => setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const effectiveCollapsed = isMobile ? false : collapsed;

  return (
    <>
      <div className="mobile-topbar">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {mobileOpen ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
          </svg>
        </button>
        <div className="nav-brand">
          <Logo size={20} />
          Fourfold
        </div>
      </div>
      {mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar${effectiveCollapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
        <div className="nav-brand">
          <Logo size={20} />
          {!effectiveCollapsed && 'Fourfold'}
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}
              title={effectiveCollapsed ? item.label : undefined}
              onClick={() => setMobileOpen(false)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {item.icon}
              </svg>
              {!effectiveCollapsed && item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <ThemeToggle collapsed={effectiveCollapsed} />
          <NavLink
            to="/settings"
            className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}
            title={effectiveCollapsed ? 'Settings' : undefined}
            onClick={() => setMobileOpen(false)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
            {!effectiveCollapsed && 'Settings'}
          </NavLink>
          <button
            type="button"
            className="side-link collapse-toggle"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : undefined}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              {collapsed ? <path d="m9 6 6 6-6 6" /> : <path d="m15 6-6 6 6 6" />}
            </svg>
            {!collapsed && 'Collapse'}
          </button>
        </div>
      </aside>
    </>
  );
}
