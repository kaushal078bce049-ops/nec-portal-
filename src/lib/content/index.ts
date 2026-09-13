import 'server-only';

import fs from 'node:fs';
import path from 'node:path';

import type {
  Blueprint,
  ExamScheme,
  Paper,
  PaperMeta,
  PracticeBank,
  PublicQuestion,
  Question,
  ReviewQuestion,
  RevisionCard,
  Library,
  SiteConfig,
  SocialLink,
  Syllabus,
  TheoryChapter,
} from './types';

/**
 * Server-only content layer.
 *
 * All question banks live as JSON on disk rather than in Postgres. That keeps
 * every answer and worked solution reviewable in version control, and — because
 * this module is `server-only` — makes it impossible to import the answer key
 * into a client bundle. Nothing here is ever handed to the browser unfiltered:
 * callers must go through `toPublicQuestion` / `toReviewQuestion`.
 */

const CONTENT_ROOT = path.join(process.cwd(), 'content');

// In production the content never changes at runtime, so cache aggressively.
// In development, re-read so edits show up on refresh.
const cache = new Map<string, unknown>();
const shouldCache = process.env.NODE_ENV === 'production';

function readJson<T>(relativePath: string): T {
  if (shouldCache && cache.has(relativePath)) {
    return cache.get(relativePath) as T;
  }
  const full = path.join(CONTENT_ROOT, relativePath);
  // Strip a UTF-8 BOM if an editor added one — JSON.parse rejects it.
  const raw = fs.readFileSync(full, 'utf8').replace(/^﻿/, '');
  const parsed = JSON.parse(raw) as T;
  if (shouldCache) cache.set(relativePath, parsed);
  return parsed;
}

function readJsonIfExists<T>(relativePath: string): T | null {
  const full = path.join(CONTENT_ROOT, relativePath);
  if (!fs.existsSync(full)) return null;
  return readJson<T>(relativePath);
}

function listJson(relativeDir: string): string[] {
  const full = path.join(CONTENT_ROOT, relativeDir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith('.json'))
    .sort();
}

// -----------------------------------------------------------------------------
// Syllabus & blueprint
// -----------------------------------------------------------------------------

export function getSyllabus(): Syllabus {
  return readJson<Syllabus>('syllabus.json');
}

export function getBlueprint(): Blueprint {
  return readJson<Blueprint>('exam-blueprint.json');
}

export function getActiveScheme(): ExamScheme {
  const bp = getBlueprint();
  const scheme = bp.schemes[bp.activeScheme] ?? bp.alternateSchemes[bp.activeScheme];
  if (!scheme) {
    throw new Error(
      `exam-blueprint.json: activeScheme "${bp.activeScheme}" is not defined in schemes or alternateSchemes.`,
    );
  }
  return scheme;
}

export function getChapterWeightage(): Record<string, number> {
  const bp = getBlueprint();
  const profile = bp.weightage[bp.activeWeightage];
  if (!profile) {
    throw new Error(`exam-blueprint.json: activeWeightage "${bp.activeWeightage}" is not defined.`);
  }
  return profile.chapters;
}

export function getAttribution() {
  return getBlueprint().attribution;
}

/**
 * Site-wide configuration the administrator edits by hand: branding, social
 * links, payment details and contact information. Kept in `content/site.json`
 * rather than in code or in the database so that changing a phone number or a
 * QR image never needs a developer, a migration or a rebuild of the schema.
 *
 * Fields whose value still begins with "PLACEHOLDER" are treated as unset by
 * the helpers below, so a half-configured site renders cleanly instead of
 * publishing a fake phone number.
 */
/**
 * The published offline editions, or null before anything has been uploaded.
 *
 * Absent is a normal state, not an error: a fresh clone has no manifest, and
 * the page that renders this says so rather than showing an empty list.
 */
export function getLibrary(): Library | null {
  const lib = readJsonIfExists<Library>('library.json');
  if (!lib || !Array.isArray(lib.files) || lib.files.length === 0) return null;
  return lib;
}

export function getSiteConfig(): SiteConfig {
  return readJson<SiteConfig>('site.json');
}

/** A config value counts as set only if it is present and not a placeholder. */
export function isConfigured(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim() !== '' && !value.startsWith('PLACEHOLDER');
}

/** Social links that are both enabled and actually filled in. */
export function getActiveSocialLinks(): SocialLink[] {
  return getSiteConfig().social.filter((s) => s.enabled && isConfigured(s.url));
}

// -----------------------------------------------------------------------------
// Redaction helpers — the boundary between server truth and client payloads
// -----------------------------------------------------------------------------

export function toPublicQuestion(q: Question): PublicQuestion {
  return {
    id: q.id,
    chapter: q.chapter,
    subchapter: q.subchapter,
    marks: q.marks,
    stem: q.stem,
    options: q.options,
    difficulty: q.difficulty,
    tags: q.tags,
  };
}

export function toReviewQuestion(q: Question): ReviewQuestion {
  return {
    ...toPublicQuestion(q),
    answerIndex: q.answerIndex,
    solution: q.solution,
    examTip: q.examTip,
    verification: q.verification,
  };
}

// -----------------------------------------------------------------------------
// Papers: past papers and model sets
// -----------------------------------------------------------------------------

function paperDir(kind: 'past_paper' | 'model_set') {
  return kind === 'past_paper' ? 'questions/past-papers' : 'questions/model-sets';
}

/** Metadata for every paper of a kind, cheap enough for index pages. */
export function listPapers(kind: 'past_paper' | 'model_set'): PaperMeta[] {
  return listJson(paperDir(kind))
    .map((file) => {
      const paper = readJson<Paper>(`${paperDir(kind)}/${file}`);
      return {
        slug: paper.slug,
        kind: paper.kind,
        title: paper.title,
        examDate: paper.examDate,
        tier: paper.tier,
        order: paper.order,
        notes: paper.notes,
      } satisfies PaperMeta;
    })
    .sort((a, b) => a.order - b.order);
}

export function getPaper(kind: 'past_paper' | 'model_set', slug: string): Paper | null {
  const safe = slug.replace(/[^a-z0-9-]/gi, '');
  if (safe !== slug) return null; // reject traversal attempts outright
  return readJsonIfExists<Paper>(`${paperDir(kind)}/${safe}.json`);
}

// -----------------------------------------------------------------------------
// Practice banks (per chapter)
// -----------------------------------------------------------------------------

export function getPracticeBank(chapterCode: string): PracticeBank | null {
  const safe = chapterCode.replace(/[^A-Za-z0-9]/g, '');
  if (safe !== chapterCode) return null;
  return readJsonIfExists<PracticeBank>(`questions/practice/${safe}.json`);
}

export function countPracticeQuestions(chapterCode: string): number {
  return getPracticeBank(chapterCode)?.questions.length ?? 0;
}

// -----------------------------------------------------------------------------
// Theory & quick revision
// -----------------------------------------------------------------------------

export function getTheory(subchapterCode: string): TheoryChapter | null {
  const safe = subchapterCode.replace(/[^A-Za-z0-9]/g, '');
  if (safe !== subchapterCode) return null;
  return readJsonIfExists<TheoryChapter>(`theory/${safe}.json`);
}

export function getRevisionCards(chapterCode: string): RevisionCard[] {
  const safe = chapterCode.replace(/[^A-Za-z0-9]/g, '');
  if (safe !== chapterCode) return [];
  return readJsonIfExists<RevisionCard[]>(`quick-revision/${safe}.json`) ?? [];
}

// -----------------------------------------------------------------------------
// Question lookup across every bank — used by scoring and the review screen
// -----------------------------------------------------------------------------

let questionIndex: Map<string, Question> | null = null;

function buildQuestionIndex(): Map<string, Question> {
  const index = new Map<string, Question>();

  const add = (q: Question) => {
    if (index.has(q.id)) {
      throw new Error(`Duplicate question id "${q.id}" across content files.`);
    }
    index.set(q.id, q);
  };

  for (const kind of ['past_paper', 'model_set'] as const) {
    for (const file of listJson(paperDir(kind))) {
      readJson<Paper>(`${paperDir(kind)}/${file}`).questions.forEach(add);
    }
  }
  for (const file of listJson('questions/practice')) {
    readJson<PracticeBank>(`questions/practice/${file}`).questions.forEach(add);
  }

  return index;
}

export function getQuestionIndex(): Map<string, Question> {
  if (shouldCache && questionIndex) return questionIndex;
  const built = buildQuestionIndex();
  if (shouldCache) questionIndex = built;
  return built;
}

export function getQuestions(ids: string[]): Question[] {
  const index = getQuestionIndex();
  const out: Question[] = [];
  for (const id of ids) {
    const q = index.get(id);
    if (q) out.push(q);
  }
  return out;
}

// -----------------------------------------------------------------------------
// Access
// -----------------------------------------------------------------------------
//
// EVERYTHING ON THIS PORTAL IS FREE. There is no paid tier, no payment flow and
// no locked content. The two helpers below are kept so that the call sites in
// exam.ts and the practice page keep a single place to ask the question, but
// both now answer unconditionally. Do not reintroduce a tier check here without
// also restoring the pricing page and the payment routes, which were removed.

/** Whether a given paper is readable. Always true — all content is free. */
export function canAccessPaper(): boolean {
  return true;
}

/**
 * How many practice questions a viewer may see for a chapter.
 * `null` means unlimited, which is now always the case.
 */
export function practiceLimitFor(): number | null {
  return null;
}
