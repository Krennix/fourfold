import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'fourfold-nav-visibility';

type Visibility = Record<string, boolean>;

interface NavVisibilityContextValue {
  visibility: Visibility;
  isVisible: (to: string) => boolean;
  setVisible: (to: string, visible: boolean) => void;
}

const NavVisibilityContext = createContext<NavVisibilityContextValue | null>(null);

function loadVisibility(): Visibility {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore malformed/unavailable storage
  }
  return {};
}

export function NavVisibilityProvider({ children }: { children: ReactNode }) {
  const [visibility, setVisibility] = useState<Visibility>(loadVisibility);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility));
    } catch {
      // ignore storage errors (private browsing, etc.)
    }
  }, [visibility]);

  // Absent = visible, so any tab never explicitly hidden (including new ones) shows by default.
  const isVisible = (to: string) => visibility[to] ?? true;
  const setVisible = (to: string, visible: boolean) => {
    setVisibility((prev) => ({ ...prev, [to]: visible }));
  };

  return (
    <NavVisibilityContext.Provider value={{ visibility, isVisible, setVisible }}>
      {children}
    </NavVisibilityContext.Provider>
  );
}

export function useNavVisibility() {
  const ctx = useContext(NavVisibilityContext);
  if (!ctx) throw new Error('useNavVisibility must be used within a NavVisibilityProvider');
  return ctx;
}
