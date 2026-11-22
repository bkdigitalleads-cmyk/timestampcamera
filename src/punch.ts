/**
 * The punch list as pure functions checked by `npm test`: adding, ticking
 * off, reopening, moving and counting. Items keep their place; ticking an
 * item off records when.
 */
import type { PunchItem } from './model.ts';

/** A new item at the end of the list. Empty titles are refused (null). */
export function addItem(items: PunchItem[], o: { id: string; jobId: string; title: string; note?: string; now: number }): PunchItem | null {
  const title = o.title.replace(/\s+/g, ' ').trim();
  if (!title) return null;
  const position = items.reduce((m, i) => Math.max(m, i.position), -1) + 1;
  return { id: o.id, jobId: o.jobId, position, title: title.slice(0, 140), note: (o.note ?? '').trim(), status: 'open', doneAt: null, createdAt: o.now, updatedAt: o.now };
}

/** Done becomes open and open becomes done; done records the time. */
export function toggleItem(item: PunchItem, now: number): PunchItem {
  return item.status === 'done' ? { ...item, status: 'open', doneAt: null, updatedAt: now } : { ...item, status: 'done', doneAt: now, updatedAt: now };
}

/** Moves an item one place up or down. Returns the items whose position changed. */
export function moveItem(items: PunchItem[], id: string, dir: -1 | 1, now: number): PunchItem[] {
  const sorted = [...items].sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
  const i = sorted.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return [];
  const a = sorted[i];
  const b = sorted[j];
  return [
    { ...a, position: b.position === a.position ? a.position + dir : b.position, updatedAt: now },
    { ...b, position: a.position, updatedAt: now },
  ];
}

export function punchCounts(items: PunchItem[]): { total: number; open: number; done: number } {
  const done = items.filter((i) => i.status === 'done').length;
  return { total: items.length, open: items.length - done, done };
}

/** "3 of 5 done", "Nothing yet" or "All 4 done". */
export function punchSummary(items: PunchItem[]): string {
  const c = punchCounts(items);
  if (c.total === 0) return 'Nothing on the list yet';
  if (c.open === 0) return c.total === 1 ? 'Done' : `All ${c.total} done`;
  return `${c.done} of ${c.total} done`;
}

/** In list order. */
export function ordered(items: PunchItem[]): PunchItem[] {
  return [...items].sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
}
