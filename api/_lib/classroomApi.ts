import type { LmsAssignment } from './lmsShared.js';

const API_BASE = 'https://classroom.googleapis.com/v1';

async function classroomFetch<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Classroom API returned ${res.status}`);
  return res.json() as Promise<T>;
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

/** Server-side twin of src/lib/googleClassroom.ts's fetchClassroomAssignments — used by the
 * `homework` API action, which runs without a browser to mint its own access token from. */
export async function fetchClassroomAssignments(accessToken: string): Promise<LmsAssignment[]> {
  const courseData = await classroomFetch<{ courses?: ClassroomCourse[] }>(accessToken, '/courses?courseStates=ACTIVE&pageSize=100');
  const courses = courseData.courses ?? [];

  const perCourse = await Promise.all(
    courses.map(async (course) => {
      try {
        const workData = await classroomFetch<{ courseWork?: ClassroomCourseWork[] }>(
          accessToken,
          `/courses/${course.id}/courseWork?pageSize=100&courseWorkStates=PUBLISHED`,
        );
        const items = workData.courseWork ?? [];
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
      } catch {
        return [];
      }
    }),
  );

  return perCourse.flat().sort((a, b) => a.due.localeCompare(b.due));
}
