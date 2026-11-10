import { useEffect, useState, useSyncExternalStore } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useTheme } from '../state/ThemeContext';
import { useNavVisibility } from '../state/NavVisibilityContext';
import { useAuth } from '../state/AuthContext';
import { useUI } from '../state/UIContext';
import { usePomodoro } from '../state/PomodoroContext';
import { navItems, NAV_GROUPS } from '../lib/navItems';
import { getSyncSnapshot, subscribeSync } from '../lib/remoteStore';
import { Logo } from './Logo';
import { Icon } from './Icon';
import './Sidebar.css';

const COLLAPSE_KEY = 'sidebar-collapsed';
const MOBILE_QUERY = '(max-width: 768px)';
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function NavIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

let cachedSnap = getSyncSnapshot();
function readSync() {
  const next = getSyncSnapshot();
  if (next.status !== cachedSnap.status || next.lastSavedAt !== cachedSnap.lastSavedAt) cachedSnap = next;
  return cachedSnap;
}

function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
  );
}

export function SyncIndicator({ compact }: { compact?: boolean }) {
  const { status } = useSyncExternalStore(subscribeSync, readSync);
  const online = useOnline();
  const state = !online ? 'offline' : status === 'error' ? 'error' : status === 'saving' ? 'saving' : 'saved';
  const label = { offline: 'Offline — changes will sync later', error: 'Sync issue — retrying', saving: 'Saving…', saved: 'All changes saved' }[state];
  return (
    <div className={`sync-indicator sync-${state}`} title={label} role="status" aria-label={label}>
      <Icon name={state === 'offline' || state === 'error' ? 'cloud-off' : 'cloud'} />
      {!compact && <span>{state === 'saved' ? 'Synced' : state === 'saving' ? 'Saving…' : state === 'offline' ? 'Offline' : 'Retrying…'}</span>}
    </div>
  );
}

function FocusPill({ collapsed }: { collapsed: boolean }) {
  const { isRunning, secondsLeft, mode, toggleRun } = usePomodoro();
  if (!isRunning) return null;
  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, '0');
  return (
    <button type="button" className={`focus-pill${collapsed ? ' collapsed' : ''}`} onClick={toggleRun} title="Pause timer">
      <span className="focus-pill-dot" />
      {collapsed ? `${mm}m` : `${mode === 'focus' ? 'Focus' : 'Break'} · ${mm}:${ss}`}
      {!collapsed && <Icon name="pause" />}
    </button>
  );
}

export function Sidebar() {
  const { isVisible } = useNavVisibility();
  const { theme, setTheme } = useTheme();
  const { email, logout } = useAuth();
  const { openPalette } = useUI();
  const location = useLocation();
  const visibleNavItems = navItems.filter((item) => isVisible(item.to));
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      // ignore storage errors (private browsing, etc.)
    }
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    return () => document.body.classList.remove('sidebar-collapsed');
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

  // Close the drawer whenever the route changes.
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    if (mobileOpen) setMobileOpen(false);
  }

  const c = isMobile ? false : collapsed;
  const close = () => setMobileOpen(false);
  const pageTitle = [...navItems, { to: '/settings', label: 'Settings' }].find((n) =>
    n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to),
  )?.label;

  return (
    <>
      <header className="mobile-topbar">
        <button type="button" className="mobile-icon-btn" onClick={() => setMobileOpen(true)} aria-label="Open menu" aria-expanded={mobileOpen}>
          <Icon name="menu" />
        </button>
        <Link to="/" className="mobile-brand">
          <Logo size={22} />
          <span>{pageTitle && location.pathname !== '/' ? pageTitle : 'FourFold'}</span>
        </Link>
        <SyncIndicator compact />
        <button type="button" className="mobile-icon-btn" onClick={() => openPalette()} aria-label="Search">
          <Icon name="search" />
        </button>
      </header>

      {mobileOpen && <div className="sidebar-backdrop" onClick={close} />}
      <aside className={`sidebar${c ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-top">
          <Link to="/" className="nav-brand" title="FourFold — Home" onClick={close}>
            <span className="brand-mark"><Logo size={22} /></span>
            {!c && <span>FourFold</span>}
          </Link>
          {!isMobile && !c && (
            <button type="button" className="sidebar-icon-btn" onClick={() => setCollapsed(true)} aria-label="Collapse sidebar" title="Collapse sidebar">
              <Icon name="sidebar" />
            </button>
          )}
          {isMobile && (
            <button type="button" className="sidebar-icon-btn" onClick={close} aria-label="Close menu">
              <Icon name="x" />
            </button>
          )}
        </div>

        <div className="sidebar-actions">
          <button
            type="button"
            className="sidebar-search"
            onClick={() => {
              close();
              openPalette();
            }}
            title={c ? 'Search (⌘K)' : undefined}
          >
            <Icon name="search" />
            {!c && (
              <>
                <span>Search or jump…</span>
                <kbd>{IS_MAC ? '⌘K' : 'Ctrl K'}</kbd>
              </>
            )}
          </button>
          <button
            type="button"
            className="sidebar-new"
            onClick={() => {
              close();
              openPalette('task');
            }}
            title="Quick-add a task (N)"
            aria-label="Quick-add a task"
          >
            <Icon name="plus" strokeWidth={2.2} />
            {!c && <span>New task</span>}
          </button>
        </div>

        <FocusPill collapsed={c} />

        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => {
            const items = visibleNavItems.filter((i) => i.group === group);
            if (items.length === 0) return null;
            return (
              <div className="nav-group" key={group}>
                {!c && <div className="nav-group-label">{group}</div>}
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}
                    title={c ? item.label : undefined}
                    onClick={close}
                  >
                    <NavIcon>{item.icon}</NavIcon>
                    {!c && <span className="side-link-label">{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {!c && <SyncIndicator />}
          <button
            type="button"
            className="side-link"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={c ? (isDark ? 'Light mode' : 'Dark mode') : undefined}
          >
            <Icon name={isDark ? 'sun' : 'moon'} />
            {!c && <span className="side-link-label">{isDark ? 'Light mode' : 'Dark mode'}</span>}
          </button>
          <NavLink
            to="/settings"
            className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}
            title={c ? 'Settings' : undefined}
            onClick={close}
          >
            <Icon name="settings" />
            {!c && <span className="side-link-label">Settings</span>}
          </NavLink>
          {c && !isMobile && (
            <button type="button" className="side-link" onClick={() => setCollapsed(false)} aria-label="Expand sidebar" title="Expand sidebar">
              <Icon name="chevron-right" />
            </button>
          )}
          {email && !c && (
            <div className="account-row">
              <span className="account-avatar" aria-hidden>{email[0]?.toUpperCase()}</span>
              <span className="account-email" title={email}>{email}</span>
              <button type="button" className="sidebar-icon-btn" onClick={logout} aria-label="Sign out" title="Sign out">
                <Icon name="logout" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

const TAB_ITEMS = ['/', '/matrix', '/calendar', '/habits'];

export function MobileTabBar() {
  const { openPalette } = useUI();
  const items = TAB_ITEMS.map((to) => navItems.find((n) => n.to === to)!).filter(Boolean);
  const short: Record<string, string> = { '/': 'Home', '/matrix': 'Tasks', '/calendar': 'Calendar', '/habits': 'Habits' };
  const left = items.slice(0, 2);
  const right = items.slice(2);
  const tab = (item: (typeof items)[number]) => (
    <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `tab-link${isActive ? ' active' : ''}`}>
      <NavIcon>{item.icon}</NavIcon>
      <span>{short[item.to]}</span>
    </NavLink>
  );
  return (
    <nav className="mobile-tabbar" aria-label="Quick navigation">
      {left.map(tab)}
      <button type="button" className="tab-fab" onClick={() => openPalette('task')} aria-label="Quick-add a task">
        <Icon name="plus" strokeWidth={2.4} />
      </button>
      {right.map(tab)}
    </nav>
  );
}
