import { buildOAuth1Header } from './oauth1.js';
import { stripHtml, type LmsAssignment } from './lmsShared.js';

const API_BASE = 'https://api.schoology.com/v1';
const CONSUMER_KEY = process.env.SCHOOLOGY_CONSUMER_KEY ?? '';
const CONSUMER_SECRET = process.env.SCHOOLOGY_CONSUMER_SECRET ?? '';

export function schoologyApiConfigured(): boolean {
  return Boolean(CONSUMER_KEY && CONSUMER_SECRET);
}

async function schoologyFetch<T>(path: string, userKey: string, userSecret: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const header = buildOAuth1Header('GET', url, {
    consumerKey: CONSUMER_KEY,
    consumerSecret: CONSUMER_SECRET,
    token: userKey,
    tokenSecret: userSecret,
  });
  const res = await fetch(url, { headers: { Authorization: header, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Schoology API returned ${res.status}`);
  return res.json() as Promise<T>;
}

interface SchoologySection {
  id: number;
  course_title?: string;
  section_title?: string;
}

interface SchoologyAssignmentApi {
  id: number;
  title: string;
  description: string | null;
  /** "YYYY-MM-DD HH:MM:SS" in the school's local time — Schoology's API gives no offset. */
  due: string | null;
  max_points: number | string | null;
}

function toIso(due: string | null): string | null {
  if (!due) return null;
  const iso = due.includes('T') ? due : due.replace(' ', 'T');
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

/** Pulls assignments for every section the account is enrolled in via Schoology's personal
 * (two-legged OAuth 1.0a) API access — unlike the .ics export, this includes `max_points`. */
export async function fetchSchoologyAssignmentsViaApi(userKey: string, userSecret: string): Promise<LmsAssignment[]> {
  const sections = await schoologyFetch<{ section?: SchoologySection[] }>('/users/me/sections', userKey, userSecret);

  const perSection = await Promise.all(
    (sections.section ?? []).map(async (section) => {
      try {
        const body = await schoologyFetch<{ assignment?: SchoologyAssignmentApi[] }>(
          `/sections/${section.id}/assignments`,
          userKey,
          userSecret,
        );
        const category = section.course_title || section.section_title || '';
        return (body.assignment ?? [])
          .map((a): LmsAssignment | null => {
            const due = toIso(a.due);
            if (!due) return null;
            const rawPoints = a.max_points;
            const points = rawPoints === null || rawPoints === undefined || rawPoints === '' ? null : Number(rawPoints);
            return {
              uid: `schoology-${section.id}-${a.id}`,
              title: a.title,
              description: stripHtml(a.description),
              due,
              allDay: false,
              categories: category ? [category] : [],
              priority: null,
              points: points !== null && Number.isFinite(points) ? points : null,
              url: `https://app.schoology.com/assignment/${a.id}`,
              source: 'schoology',
            };
          })
          .filter((a): a is LmsAssignment => a !== null);
      } catch {
        return [];
      }
    }),
  );

  return perSection.flat().sort((a, b) => a.due.localeCompare(b.due));
}
