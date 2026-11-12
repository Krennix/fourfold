// Regression checks for the quick-add parser. Run with: bun scripts/quickadd-test.ts
import { parseQuickAdd } from '../src/lib/quickAdd';

// Thursday 12 Nov 2026
const now = new Date(2026, 10, 12, 10, 0);

type Want = { title: string; quad?: string; dueDate?: string | null; time?: string | null; durationMin?: number | null };
const cases: [string, Want][] = [
  ['Essay outline due Monday 45M !1', { title: 'Essay outline', quad: 'q1', dueDate: '2026-11-16', durationMin: 45 }],
  ['ohh yah essay outline is due on monday @ 5pm or smth', { title: 'essay outline', dueDate: '2026-11-16', time: '17:00' }],
  ['essay outline due on Monday @3', { title: 'essay outline', dueDate: '2026-11-16', time: '15:00' }],
  ['essay outline due by friday @noon', { title: 'essay outline', dueDate: '2026-11-13', time: '12:00' }],
  ['essay outline due this friday @ 3:30', { title: 'essay outline', dueDate: '2026-11-13', time: '15:30' }],
  ['essay outline due next friday', { title: 'essay outline', dueDate: '2026-11-20' }],
  ['essay outline due next monday', { title: 'essay outline', dueDate: '2026-11-16' }],
  ['essay outline due eod tmr', { title: 'essay outline', dueDate: '2026-11-13' }],
  ['essay outline due the 16th', { title: 'essay outline', dueDate: '2026-11-16' }],
  ['essay outline due in a week', { title: 'essay outline', dueDate: '2026-11-19' }],
  ['essay outline due monday, 3pm', { title: 'essay outline', dueDate: '2026-11-16', time: '15:00' }],
  ['read ch 4 for half an hour tomorrow', { title: 'read ch 4', dueDate: '2026-11-13', durationMin: 30 }],
  ['Finish history essay tomorrow 3pm 45m !1', { title: 'Finish history essay', quad: 'q1', dueDate: '2026-11-13', time: '15:00', durationMin: 45 }],
  ['Monday standup notes mon', { title: 'Monday standup notes', dueDate: '2026-11-16' }],
  // Nothing was extracted, so connector words are left alone.
  ['Log on', { title: 'Log on', dueDate: null }],
  ['Call grandma sat', { title: 'Call grandma', dueDate: '2026-11-14' }],
];

let failed = 0;
for (const [input, want] of cases) {
  const got = parseQuickAdd(input, now);
  for (const [k, v] of Object.entries(want)) {
    const actual = (got as unknown as Record<string, unknown>)[k];
    if (actual !== v) {
      failed++;
      console.error(`FAIL ${JSON.stringify(input)}\n  ${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(actual)}`);
    }
  }
}
if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log(`quick-add: ${cases.length} cases passed`);
