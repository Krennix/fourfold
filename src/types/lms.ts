/** A homework/assignment item pulled from an LMS (Schoology, Canvas, or Google Classroom),
 * normalized to a single shape regardless of source. */
export interface LmsAssignment {
  uid: string;
  title: string;
  description: string | null;
  /** ISO 8601 due date/time. */
  due: string;
  allDay: boolean;
  /** Course/category names, when the source identifies one. */
  categories: string[];
  /** RFC 5545 PRIORITY (1-4 high, 5 normal, 6-9 low, 0/absent = none). Only ICS feeds set this. */
  priority: number | null;
  /** Points possible, when the source's API exposes it (never available from a plain ICS feed). */
  points: number | null;
  /** Link to the assignment on the source platform, if available. */
  url: string | null;
  source: 'schoology' | 'canvas' | 'classroom';
}
