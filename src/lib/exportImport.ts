import { getStoredSession } from '../state/AuthContext';
import type { RemoteNamespace } from './remoteStore';

export const EXPORTABLE_NAMESPACES: RemoteNamespace[] = [
  'school',
  'habits',
  'matrix',
  'countdowns',
  'agentChat',
  'dailyPlan',
  'watchdogDismissed',
  'friends',
];

export interface FourFoldExport {
  version: 1;
  exportedAt: string;
  email: string;
  data: Partial<Record<RemoteNamespace, unknown>>;
  localCalendarEvents?: unknown;
}

export async function exportAllData(email: string, includeLocalCalendar: boolean): Promise<FourFoldExport> {
  const session = getStoredSession();
  const entries = await Promise.all(
    EXPORTABLE_NAMESPACES.map(async (ns) => {
      const res = await fetch(`/api/data?ns=${ns}`, { headers: { Authorization: `Bearer ${session?.token ?? ''}` } });
      const body = res.ok ? await res.json() : { value: null };
      return [ns, body.value ?? null] as const;
    }),
  );
  const data = Object.fromEntries(entries) as Partial<Record<RemoteNamespace, unknown>>;
  const result: FourFoldExport = { version: 1, exportedAt: new Date().toISOString(), email, data };
  if (includeLocalCalendar) {
    try {
      result.localCalendarEvents = JSON.parse(localStorage.getItem('fourfold.calendar.v1') ?? 'null');
    } catch {
      // ignore malformed/unavailable storage
    }
  }
  return result;
}

export function downloadJson(filename: string, obj: unknown): void {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function isValidExport(obj: unknown): obj is FourFoldExport {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return o.version === 1 && typeof o.data === 'object' && o.data !== null;
}

export async function importAllData(imported: FourFoldExport): Promise<void> {
  const session = getStoredSession();
  if (!session) throw new Error('Not signed in.');
  await Promise.all(
    EXPORTABLE_NAMESPACES.map(async (ns) => {
      if (!(ns in imported.data)) return;
      await fetch(`/api/data?ns=${ns}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify(imported.data[ns] ?? null),
      });
    }),
  );
  if (imported.localCalendarEvents !== undefined) {
    try {
      localStorage.setItem('fourfold.calendar.v1', JSON.stringify(imported.localCalendarEvents));
    } catch {
      // ignore storage errors (private browsing, quota, etc.)
    }
  }
}
