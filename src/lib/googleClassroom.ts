import type { LmsAssignment } from '../types/lms';

const API_BASE = 'https://classroom.googleapis.com/v1';

/** Thrown when Google rejects the access token itself (401/403, including "insufficient scope"
 * for accounts that connected Calendar sync before the Classroom scope was added) — the caller
 * should treat this as "not connected" rather than a generic fetch failure. */
export class ClassroomAuthError extends Error {}

async function classroomFetch(accessToken: string, path: string) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401 || res.status === 403) throw new ClassroomAuthError(`Classroom API error ${res.status}: ${body}`);
    throw new Error(`Classroom API error ${res.status}: ${body}`);
  }
  return res.json();
}

interface ClassroomCourse {
  id: string;
  name: string;
}

interface ClassroomDate {
  year: number;
  month: number;
  day: number;
}

interface ClassroomTimeOfDay {
  hours?: number;
  minutes?: number;
}

interface ClassroomCourseWork {
  id: string;
  title: string;
  description?: string;
  dueDate?: ClassroomDate;
  dueTime?: ClassroomTimeOfDay;
  maxPoints?: number;
  alternateLink?: string;
}

/** Classroom splits a due date into separate UTC date/time-of-day fields — combine them back
 * into one ISO instant. No dueTime means "due at end of day", so it's treated as all-day. */
function dueToIso(dueDate?: ClassroomDate, dueTime?: ClassroomTimeOfDay): string | null {
  if (!dueDate) return null;
  const y = String(dueDate.year).padStart(4, '0');
  const mo = String(dueDate.month).padStart(2, '0');
  const d = String(dueDate.day).padStart(2, '0');
  if (dueTime === undefined) return `${y}-${mo}-${d}T00:00:00Z`;
  const h = String(dueTime.hours ?? 0).padStart(2, '0');
  const mi = String(dueTime.minutes ?? 0).padStart(2, '0');
  return `${y}-${mo}-${d}T${h}:${mi}:00Z`;
}

/** Pulls courseWork (assignments) for every active course via the Google Classroom API — called
 * directly from the browser with a Calendar-sync access token that also carries the
 * classroom.coursework.me.readonly scope, the same pattern src/lib/googleCalendar.ts uses. */
export async function fetchClassroomAssignments(accessToken: string): Promise<LmsAssignment[]> {
  const courseData = await classroomFetch(accessToken, '/courses?courseStates=ACTIVE&pageSize=100');
  const courses: ClassroomCourse[] = courseData.courses ?? [];

  const perCourse = await Promise.all(
    courses.map(async (course) => {
      try {
        const workData = await classroomFetch(accessToken, `/courses/${course.id}/courseWork?pageSize=100&courseWorkStates=PUBLISHED`);
        const items: ClassroomCourseWork[] = workData.courseWork ?? [];
        return items
          .map((w): LmsAssignment | null => {
            const due = dueToIso(w.dueDate, w.dueTime);
            if (!due) return null;
            return {
              uid: `classroom-${course.id}-${w.id}`,
              title: w.title,
              description: w.description ?? null,
              due,
              allDay: w.dueTime === undefined,
              categories: [course.name],
              priority: null,
              points: typeof w.maxPoints === 'number' ? w.maxPoints : null,
              url: w.alternateLink ?? null,
              source: 'classroom',
            };
          })
          .filter((a): a is LmsAssignment => a !== null);
      } catch (err) {
        if (err instanceof ClassroomAuthError) throw err;
        return [];
      }
    }),
  );

  return perCourse.flat().sort((a, b) => a.due.localeCompare(b.due));
}
