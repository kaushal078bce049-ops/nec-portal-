import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

import {
  getActiveScheme,
  getPaper,
  getQuestions,
  toPublicQuestion,
  toReviewQuestion,
} from '@/lib/content';
import type { ReviewQuestion } from '@/lib/content/types';
import { guestSecret } from '@/lib/env';
import { scoreAttempt, type ChapterBreakdownRow } from '@/lib/scoring';
import { badRequest, forbidden, notFound } from '@/lib/security';

import type { AttemptResult, AttemptState } from '@/lib/exam';

/**
 * Guest exam engine: lets a visitor sit a FREE paper with no account and no
 * database.
 *
 * Why this exists. The portal's free sets are its shopfront — a candidate who is
 * made to create an account before seeing a single question mostly leaves. It
 * also means the free tier keeps working when Supabase is not configured, which
 * is the state the project is in until the owner supplies real keys.
 *
 * How the state is kept honest without a database. The whole attempt lives in
 * one httpOnly cookie, HMAC-signed with a server-only secret:
 *
 *   - the client holds the bytes but cannot forge them (no secret), so the
 *     DEADLINE cannot be extended and the paper cannot be swapped;
 *   - the question set is not stored at all — it is re-derived from the static
 *     paper by slug, so it cannot be reshuffled into an easier set;
 *   - responses are stored compactly, one character per question, which keeps
 *     a 100-question attempt inside the 4 KB cookie limit;
 *   - correct answers and solutions are still never sent to the browser until
 *     the attempt is submitted, exactly as in the signed-in path.
 *
 * What a guest deliberately does NOT get, and why that is the right trade: no
 * stored history, no progress tracking, no leaderboard, no forum. Those need an
 * identity, and they are the honest reason to create an account. A guest can
 * also restart a paper freely by clearing the cookie — acceptable, because
 * nothing is being ranked.
 */

const COOKIE = 'nec_guest_attempt';
const COOKIE_MAX_AGE = 60 * 60 * 6; // outlives a 2 h paper without lingering
const GRACE_SECONDS = 15; // matches the signed-in engine

/** The literal attempt id the guest flow uses in URLs. */
export const GUEST_ATTEMPT_ID = 'guest';

interface GuestPayload {
  /** Schema version, so an old cookie can be rejected rather than misread. */
  v: 1;
  /** Paper kind, abbreviated to keep the cookie small. */
  k: 'p' | 'm';
  /** Paper slug. */
  s: string;
  /** Started at, epoch seconds. */
  t0: number;
  /** Deadline, epoch seconds — server-issued and signed. */
  td: number;
  /** Responses, one character per question. See encodeResponses(). */
  r: string;
  /** Submitted at, epoch seconds; absent while in progress. */
  ts?: number;
}

// -----------------------------------------------------------------------------
// Compact response encoding
// -----------------------------------------------------------------------------

/*
 * One character per question, so 100 questions cost 100 bytes rather than the
 * ~1.5 KB a JSON map would need:
 *
 *   '-'        unanswered, not marked
 *   '.'        unanswered, marked for review
 *   '0'..'5'   answered with that option, not marked
 *   'a'..'f'   answered with that option, marked for review
 */

const MARKED_OFFSET = 'a'.charCodeAt(0);

function encodeOne(selectedOption: number | null, markedReview: boolean): string {
  if (selectedOption === null) return markedReview ? '.' : '-';
  if (selectedOption < 0 || selectedOption > 5) return markedReview ? '.' : '-';
  return markedReview
    ? String.fromCharCode(MARKED_OFFSET + selectedOption)
    : String(selectedOption);
}

function decodeOne(ch: string): { selectedOption: number | null; markedReview: boolean } {
  if (ch === '-') return { selectedOption: null, markedReview: false };
  if (ch === '.') return { selectedOption: null, markedReview: true };
  if (ch >= '0' && ch <= '5') return { selectedOption: Number(ch), markedReview: false };
  if (ch >= 'a' && ch <= 'f') {
    return { selectedOption: ch.charCodeAt(0) - MARKED_OFFSET, markedReview: true };
  }
  return { selectedOption: null, markedReview: false };
}

// -----------------------------------------------------------------------------
// Signing
// -----------------------------------------------------------------------------

function sign(body: string): string {
  return createHmac('sha256', guestSecret()).update(body).digest('base64url');
}

function seal(payload: GuestPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

function unseal(token: string): GuestPayload | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = sign(body);

  // Constant-time compare so the signature cannot be discovered byte by byte.
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as GuestPayload;
    if (parsed?.v !== 1 || (parsed.k !== 'p' && parsed.k !== 'm')) return null;
    if (typeof parsed.s !== 'string' || typeof parsed.r !== 'string') return null;
    if (!Number.isFinite(parsed.t0) || !Number.isFinite(parsed.td)) return null;
    return parsed;
  } catch {
    return null;
  }
}

const kindOf = (k: 'p' | 'm'): 'past_paper' | 'model_set' =>
  k === 'p' ? 'past_paper' : 'model_set';
const abbrev = (kind: 'past_paper' | 'model_set') => (kind === 'past_paper' ? 'p' : 'm');

// -----------------------------------------------------------------------------
// Cookie access
// -----------------------------------------------------------------------------

async function readPayload(): Promise<GuestPayload | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  return raw ? unseal(raw) : null;
}

async function writePayload(payload: GuestPayload): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, seal(payload), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearGuestAttempt(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

// -----------------------------------------------------------------------------
// Start
// -----------------------------------------------------------------------------

/**
 * Open a guest attempt on any paper. All content is free, so there is no
 * entitlement check here — only the ordinary validation that the paper exists
 * and has questions.
 */
export async function startGuestAttempt(
  kind: 'past_paper' | 'model_set',
  slug: string,
): Promise<void> {
  const paper = getPaper(kind, slug);
  if (!paper) throw notFound('That paper does not exist.');

  if (paper.questions.length === 0) throw badRequest('That paper has no questions yet.');

  const scheme = getActiveScheme();
  const now = Math.floor(Date.now() / 1000);

  await writePayload({
    v: 1,
    k: abbrev(kind),
    s: slug,
    t0: now,
    td: now + scheme.durationMinutes * 60,
    r: '-'.repeat(paper.questions.length),
  });
}

// -----------------------------------------------------------------------------
// Load in-progress state
// -----------------------------------------------------------------------------

export async function getGuestAttemptState(): Promise<AttemptState | null> {
  const payload = await readPayload();
  if (!payload || payload.ts) return null;

  const kind = kindOf(payload.k);
  const paper = getPaper(kind, payload.s);
  if (!paper) return null;

  const nowMs = Date.now();
  if (payload.td * 1000 <= nowMs) return null; // expired — caller sends to the result

  const scheme = getActiveScheme();
  const totalMarks = paper.questions.reduce((sum, q) => sum + q.marks, 0);
  const passMarks = Math.ceil((scheme.passMarks / scheme.totalMarks) * totalMarks);

  const responses: AttemptState['responses'] = {};
  paper.questions.forEach((q, i) => {
    responses[q.id] = decodeOne(payload.r[i] ?? '-');
  });

  return {
    attemptId: GUEST_ATTEMPT_ID,
    kind,
    examSlug: payload.s,
    title: paper.title,
    // Same projection as the signed-in path: no answerIndex, no solution.
    questions: paper.questions.map(toPublicQuestion),
    responses,
    totalMarks,
    passMarks,
    secondsRemaining: Math.max(0, Math.floor((payload.td * 1000 - nowMs) / 1000)),
    expiresAt: new Date(payload.td * 1000).toISOString(),
    negativeMarking: scheme.negativeMarking,
  };
}

// -----------------------------------------------------------------------------
// Save a response
// -----------------------------------------------------------------------------

export async function saveGuestResponse(
  questionId: string,
  selectedOption: number | null,
  markedReview: boolean,
): Promise<void> {
  const payload = await readPayload();
  if (!payload) throw badRequest('This attempt is no longer open. Please start it again.');
  if (payload.ts) throw badRequest('This attempt is already submitted.');

  if (payload.td * 1000 + GRACE_SECONDS * 1000 <= Date.now()) {
    throw badRequest('Time is up — no further answers can be saved.');
  }

  const paper = getPaper(kindOf(payload.k), payload.s);
  if (!paper) throw notFound('That paper does not exist.');

  const index = paper.questions.findIndex((q) => q.id === questionId);
  if (index === -1) throw badRequest('That question is not part of this attempt.');
  if (selectedOption !== null && (selectedOption < 0 || selectedOption > 5)) {
    throw badRequest('Invalid option.');
  }

  const chars = payload.r.padEnd(paper.questions.length, '-').split('');
  chars[index] = encodeOne(selectedOption, markedReview);

  await writePayload({ ...payload, r: chars.join('') });
}

// -----------------------------------------------------------------------------
// Submit & score
// -----------------------------------------------------------------------------

export async function submitGuestAttempt(): Promise<void> {
  const payload = await readPayload();
  if (!payload) throw badRequest('This attempt is no longer open.');
  if (payload.ts) return; // idempotent

  await writePayload({ ...payload, ts: Math.floor(Date.now() / 1000) });
}

/**
 * Score a submitted guest attempt and hand back the full review in one go.
 *
 * Guests get their solutions immediately on submit, because there is nowhere to
 * store a result to come back to. The gate that matters is still enforced: the
 * attempt must be marked submitted before any answer or solution is released.
 */
export async function getGuestReview(): Promise<{
  result: AttemptResult;
  questions: ReviewQuestion[];
  chosen: Record<string, number | null>;
  paperSlug: string;
  paperKind: 'past_paper' | 'model_set';
} | null> {
  const payload = await readPayload();
  if (!payload) return null;

  const kind = kindOf(payload.k);
  const paper = getPaper(kind, payload.s);
  if (!paper) return null;

  const expired = payload.td * 1000 <= Date.now();
  if (!payload.ts && !expired) {
    throw forbidden('Solutions unlock once you submit this attempt.');
  }

  const scheme = getActiveScheme();
  const totalMarks = paper.questions.reduce((sum, q) => sum + q.marks, 0);
  const passMarks = Math.ceil((scheme.passMarks / scheme.totalMarks) * totalMarks);

  const chosen = new Map<string, number | null>();
  const chosenRecord: Record<string, number | null> = {};
  paper.questions.forEach((q, i) => {
    const { selectedOption } = decodeOne(payload.r[i] ?? '-');
    chosen.set(q.id, selectedOption);
    chosenRecord[q.id] = selectedOption;
  });

  const { getSyllabus } = await import('@/lib/content');
  const chapterTitles = new Map(getSyllabus().chapters.map((c) => [c.code, c.title]));

  const outcome = scoreAttempt({
    questions: getQuestions(paper.questions.map((q) => q.id)),
    chosen,
    scheme,
    passMarks,
    chapterTitles,
  });

  const endedAt = (payload.ts ?? payload.td) * 1000;

  const result: AttemptResult = {
    attemptId: GUEST_ATTEMPT_ID,
    title: paper.title,
    score: outcome.score,
    totalMarks,
    passMarks,
    passed: outcome.passed,
    correctCount: outcome.correctCount,
    wrongCount: outcome.wrongCount,
    unanswered: outcome.unanswered,
    submittedAt: new Date(endedAt).toISOString(),
    durationUsedSecs: Math.max(0, Math.floor(endedAt / 1000 - payload.t0)),
    chapterBreakdown: outcome.chapterBreakdown as ChapterBreakdownRow[],
  };

  return {
    result,
    questions: paper.questions.map(toReviewQuestion),
    chosen: chosenRecord,
    paperSlug: payload.s,
    paperKind: kind,
  };
}
