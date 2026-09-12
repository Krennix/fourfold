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

/** Strips HTML tags from API-supplied rich-text descriptions (Canvas, Schoology) down to plain text. */
export function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}
