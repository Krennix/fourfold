import { stripHtml, type LmsAssignment } from './lmsShared.js';

interface CanvasCourse {
  id: number;
  name: string;
}

interface CanvasAssignmentApi {
  id: number;
  name: string;
  description: string | null;
  due_at: string | null;
  points_possible: number | null;
  html_url: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

async function canvasFetch<T>(baseUrl: string, token: string, path: string): Promise<T> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Canvas API returned ${res.status}`);
  return res.json() as Promise<T>;
}

/** Pulls every active course's assignments via Canvas's personal-access-token REST API —
 * unlike the native .ics export, this includes `points_possible` and the full description. */
export async function fetchCanvasAssignments(baseUrl: string, token: string): Promise<LmsAssignment[]> {
  const courses = await canvasFetch<CanvasCourse[]>(baseUrl, token, '/api/v1/courses?enrollment_state=active&per_page=100');

  const perCourse = await Promise.all(
    courses.map(async (course) => {
      try {
        const assignments = await canvasFetch<CanvasAssignmentApi[]>(
          baseUrl,
          token,
          `/api/v1/courses/${course.id}/assignments?per_page=100&order_by=due_at`,
        );
        return assignments
          .filter((a) => a.due_at)
          .map(
            (a): LmsAssignment => ({
              uid: `canvas-${course.id}-${a.id}`,
              title: a.name,
              description: stripHtml(a.description),
              due: a.due_at as string,
              allDay: false,
              categories: [course.name],
              priority: null,
              points: typeof a.points_possible === 'number' ? a.points_possible : null,
              url: a.html_url,
              source: 'canvas',
            }),
          );
      } catch {
        // One course's assignments failing to load (e.g. no permission) shouldn't drop the rest.
        return [];
      }
    }),
  );

  return perCourse.flat().sort((a, b) => a.due.localeCompare(b.due));
}
