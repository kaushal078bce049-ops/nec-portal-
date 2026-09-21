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
 * Build the capsule for a date.
 *
 * Every day draws from a single fixed permutation of the pool rather than
 * reshuffling it per date, and walks forward through that permutation by the
 * day number. That is what stops questions recurring: independent daily
 * shuffles repeat far sooner than intuition suggests -- with twenty drawn from
 * a few hundred per chapter, a repeat inside a fortnight is likely rather than
 * unlucky, and candidates noticed.
 *
 * Walking a permutation instead means a question cannot come round again until
 * its chapter's pool is exhausted, which at two a day from roughly 350 is the
 * better part of a year. The permutation is seeded with a constant, not the
 * date, so it is stable across deploys and yesterday's capsule stays
 * yesterday's capsule.
 *
 * Chapter spread is preserved by advancing each chapter's own cursor, so every
 * day still covers the syllabus rather than landing in one topic.
 */
export function getDailyCapsule(date: string): DailyCapsule {
  const size = getBlueprint().dailyCapsule.questionsPerDay;

  const byChapter = new Map<string, Question[]>();
  for (const q of getQuestionIndex().values()) {
    const bucket = byChapter.get(q.chapter);
    if (bucket) bucket.push(q);
    else byChapter.set(q.chapter, [q]);
  }

  const order = getSyllabus()
    .chapters.map((c) => c.code)
    .filter((code) => (byChapter.get(code)?.length ?? 0) > 0);

  if (order.length === 0) return { date, questions: [], chapters: [] };

  // One permutation per chapter, fixed for all time. Sorting by id first makes
  // it independent of the order the content loader happens to return.
  const pools = new Map(
    order.map((code) => {
      const bucket = [...byChapter.get(code)!].sort((a, b) => a.id.localeCompare(b.id));
      return [code, shuffled(bucket, makeRandom(seedFrom('nec-capsule-pool:' + code)))] as const;
    }),
  );

  // Days since a fixed epoch. Dates before it simply count backwards, which
  // keeps the archive browsable without special-casing.
  const day = Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000);

  const perChapter = Math.floor(size / order.length);
  const remainder = size - perChapter * order.length;

  // Rotate which chapters get the spare questions, so the same ones are not
  // always over-represented.
  const startAt = ((day % order.length) + order.length) % order.length;

  const picked: Question[] = [];
  for (let step = 0; step < order.length; step++) {
    const code = order[(startAt + step) % order.length]!;
    const pool = pools.get(code)!;
    const take = perChapter + (step < remainder ? 1 : 0);
    for (let k = 0; k < take; k++) {
      // Walk forward by day; wrap only once the chapter is exhausted.
      const at = (((day * take + k) % pool.length) + pool.length) % pool.length;
      const q = pool[at]!;
      if (!picked.some((x) => x.id === q.id)) picked.push(q);
    }
  }

  // Present in a date-dependent order so the chapter round-robin is not a
  // visible pattern, without changing which questions were selected.
  const questions = shuffled(picked, makeRandom(seedFrom('nec-capsule-order:' + date)));

  return {
    date,
    questions,
    chapters: order.filter((code) => questions.some((q) => q.chapter === code)),
  };
}
