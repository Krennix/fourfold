import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useGoogleAuth } from './GoogleAuthContext';
import { fetchClassroomAssignments, ClassroomAuthError } from '../lib/googleClassroom';
import type { LmsAssignment } from '../types/lms';

export type ClassroomStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ClassroomContextValue {
  status: ClassroomStatus;
  /** The linked Google account Classroom assignments are pulled from — the first connected
   * account, since Classroom (unlike Calendar) has no per-account picker of its own. */
  accountEmail: string | null;
  assignments: LmsAssignment[];
  error: string | null;
  refresh: () => Promise<void>;
}

const ClassroomContext = createContext<ClassroomContextValue | null>(null);

export function ClassroomProvider({ children }: { children: ReactNode }) {
  const { accounts, getAccessToken } = useGoogleAuth();
  const [status, setStatus] = useState<ClassroomStatus>('idle');
  const [assignments, setAssignments] = useState<LmsAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const account = accounts[0];
    if (!account) {
      setStatus('idle');
      setAssignments([]);
      setAccountEmail(null);
      setError(null);
      return;
    }
    setAccountEmail(account.email);
    setStatus('loading');
    setError(null);
    try {
      const token = await getAccessToken(account.email);
      if (!token) {
        setStatus('error');
        setError('Could not refresh the Google account — reconnect it in Settings.');
        return;
      }
      const items = await fetchClassroomAssignments(token);
      setAssignments(items);
      setStatus('ready');
    } catch (err) {
      setAssignments([]);
      setStatus('error');
      setError(
        err instanceof ClassroomAuthError
          ? 'Classroom access is missing — reconnect your Google account in Settings to grant it.'
          : 'Could not load Google Classroom assignments.',
      );
    }
  }, [accounts, getAccessToken]);

  const firstEmail = accounts[0]?.email ?? null;
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstEmail]);

  return (
    <ClassroomContext.Provider value={{ status, accountEmail, assignments, error, refresh }}>
      {children}
    </ClassroomContext.Provider>
  );
}

export function useClassroom() {
  const ctx = useContext(ClassroomContext);
  if (!ctx) throw new Error('useClassroom must be used within a ClassroomProvider');
  return ctx;
}
