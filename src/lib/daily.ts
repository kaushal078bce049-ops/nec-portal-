import 'server-only';

import { getBlueprint, getQuestionIndex, getSyllabus } from '@/lib/content';
import type { Question } from '@/lib/content/types';

/**
 * Daily capsule: the same 20 questions for everybody, changing at midnight
 * Nepal time, free to all.
 *
 * The selection is *derived* from the date rather than stored, using a seeded
 * shuffle. That means every visitor and every server instance computes an
 * identical set with no database round-trip, yesterday's capsule can always be
 * reproduced exactly, and there is no scheduled job to fail.
 */

/** Nepal Standard Time is UTC+05:45 — no daylight saving. */
const NPT_OFFSET_MINUTES = 5 * 60 + 45;

/** Today's capsule date (YYYY-MM-DD) as it is reckoned in Kathmandu. */
export function capsuleDateFor(now: Date = new Date()): string {
  const npt = new Date(now.getTime() + NPT_OFFSET_MINUTES * 60_000);
  return npt.toISOString().slice(0, 10);
}

export function shiftCapsuleDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** FNV-1a over the date string, so the seed is stable across processes. */
function seedFrom(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32 — small, fast, deterministic. */
function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export interface DailyCapsule {
  date: string;
  questions: Question[];
  /** Chapters represented, in syllabus order, for the summary line. */
  chapters: string[];
}

/**
 * Build the capsule for a date. Questions are spread across chapters
 * round-robin so a single day never lands entirely inside one chapter.
 */
export function getDailyCapsule(date: string): DailyCapsule {
  const size = getBlueprint().dailyCapsule.questionsPerDay;
  const random = makeRandom(seedFrom(`nec-capsule:${date}`));

  // Bucket the whole pool by chapter, each bucket shuffled for this date.
  const byChapter = new Map<string, Question[]>();
  for (const q of getQuestionIndex().values()) {
    const bucket = byChapter.get(q.chapter);
    if (bucket) bucket.push(q);
    else byChapter.set(q.chapter, [q]);
  }

  const order = getSyllabus()
    .chapters.map((c) => c.code)
    .filter((code) => (byChapter.get(code)?.length ?? 0) > 0);

  if (order.length === 0) {
    return { date, questions: [], chapters: [] };
  }

  const pools = new Map(
    order.map((code) => [code, shuffled(byChapter.get(code)!, random)] as const),
  );

  // Rotate the starting chapter by date so the same chapter is not always first.
  const startAt = Math.floor(random() * order.length);
  const picked: Question[] = [];
  const cursor = new Map(order.map((code) => [code, 0]));

  let exhausted = false;
  while (picked.length < size && !exhausted) {
    exhausted = true;
    for (let step = 0; step < order.length && picked.length < size; step++) {
      const code = order[(startAt + step) % order.length]!;
      const pool = pools.get(code)!;
      const at = cursor.get(code)!;
      if (at >= pool.length) continue;
      picked.push(pool[at]!);
      cursor.set(code, at + 1);
      exhausted = false;
    }
  }

  // Final shuffle so the chapter round-robin is not visible as a pattern.
  const questions = shuffled(picked, random);

  return {
    date,
    questions,
    chapters: order.filter((code) => questions.some((q) => q.chapter === code)),
  };
}
