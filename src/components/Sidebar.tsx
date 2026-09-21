import { useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useTheme } from '../state/ThemeContext';
import { useNavVisibility } from '../state/NavVisibilityContext';
import { navItems } from '../lib/navItems';
import { Logo } from './Logo';
import './Sidebar.css';

const COLLAPSE_KEY = 'sidebar-collapsed';
const MOBILE_QUERY = '(max-width: 768px)';

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
  const { isVisible } = useNavVisibility();
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
        <Link to="/" className="nav-brand" onClick={() => setMobileOpen(false)}>
          <Logo size={24} />
          Fourfold
        </Link>
      </div>
      {mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar${effectiveCollapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
        <Link to="/" className="nav-brand" title="Fourfold — go to Home" onClick={() => setMobileOpen(false)}>
          <Logo size={28} />
          {!effectiveCollapsed && 'Fourfold'}
        </Link>
        <nav className="sidebar-nav">
          {visibleNavItems.map((item) => (
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
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
