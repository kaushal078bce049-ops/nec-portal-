/**
 * Content shapes shared by the server loader and the client components.
 *
 * The split between `Question` and `PublicQuestion` is deliberate and is the
 * single most important invariant in this codebase: `Question` carries
 * `answerIndex` and `solution`, and values of that type must never be
 * serialised into a client payload while an attempt is in progress. Use
 * `toPublicQuestion()` from `@/lib/content` at every boundary.
 */

/** All content is free; the type is kept so existing metadata stays valid. */
export type Tier = 'free';

export type Difficulty = 'easy' | 'medium' | 'hard';

export type VerificationStatus =
  | 'verified'            // independently cross-checked
  | 'key-corrected'       // the printed key was wrong; corrected here, see notes
  | 'needs-review';       // transcribed but not yet cross-checked

export interface Verification {
  status: VerificationStatus;
  /** Required when status is 'key-corrected': what was wrong and why. */
  notes?: string;
  checkedOn?: string;
}

/**
 * The exam-hall layer of a solution: what catches people out, how to get to
 * the answer quickly under time pressure, and how to remember the fact.
 * Rendered as its own panel beneath the worked explanation.
 */
export interface ExamTip {
  /** The distractor a hurried candidate picks, and precisely why it is wrong. */
  trap?: string;
  /** A shortcut, elimination route or sanity check usable in 30 seconds. */
  trick?: string;
  /** A memory aid for the fact, the ordering or the formula. */
  mnemonic?: string;
}

/** Full question, including the answer. SERVER ONLY. */
export interface Question {
  id: string;
  chapter: string;
  subchapter: string;
  marks: number;
  stem: string;
  options: string[];
  /** Zero-based index into `options`. */
  answerIndex: number;
  /** Worked digital solution, markdown with $..$ maths. */
  solution: string;
  difficulty?: Difficulty;
  tags?: string[];
  examTip?: ExamTip;
  verification?: Verification;
}

/** What the browser is allowed to see during an attempt. */
export interface PublicQuestion {
  id: string;
  chapter: string;
  subchapter: string;
  marks: number;
  stem: string;
  options: string[];
  difficulty?: Difficulty;
  tags?: string[];
}

/** Question plus answer, released only after an attempt is submitted. */
export interface ReviewQuestion extends PublicQuestion {
  answerIndex: number;
  solution: string;
  examTip?: ExamTip;
  verification?: Verification;
}

export interface PaperMeta {
  slug: string;
  kind: 'past_paper' | 'model_set';
  title: string;
  /** Present for real past papers: the NEC sitting date as printed. */
  examDate?: string;
  tier: Tier;
  order: number;
  notes?: string;
}

export interface Paper extends PaperMeta {
  questions: Question[];
}

export interface PracticeBank {
  chapter: string;
  questions: Question[];
}

export interface TheorySection {
  heading: string;
  /** Markdown body. */
  body: string;
}

export interface TheoryChapter {
  chapter: string;
  subchapter: string;
  title: string;
  /** Short exam-focused summary shown at the top. */
  summary: string;
  sections: TheorySection[];
  formulas?: { label: string; expression: string; note?: string }[];
  /** Exam-hall notes for the whole subchapter: traps, shortcuts, mnemonics. */
  examTips?: ExamTip[];
}

export interface RevisionCard {
  id: string;
  chapter: string;
  subchapter?: string;
  fact: string;
  detail?: string;
  verification?: Verification;
}

export interface Syllabus {
  exam: {
    code: string;
    authority: string;
    title: string;
    shortTitle: string;
    note: string;
  };
  groups: Record<string, { label: string; chapters: number[] }>;
  chapters: SyllabusChapter[];
}

export interface SyllabusChapter {
  no: number;
  code: string;
  title: string;
  group: string;
  subchapters: SyllabusSubchapter[];
}

export interface SyllabusSubchapter {
  no: string;
  code: string;
  title: string;
  detail: string;
}

export interface ExamScheme {
  label: string;
  totalQuestions: number;
  totalMarks: number;
  passMarks: number;
  durationMinutes: number;
  negativeMarking: boolean;
  negativeMarkPerWrong: number;
  optionsPerQuestion: number;
  questionTiers: { marks: number; count: number; secondsPerQuestion: number }[];
}

export interface TierConfig {
  pastPaperSets: number | 'all';
  modelSets: number | 'all';
  theory: 'all';
  quickRevision: 'all';
  dailyCapsule: 'all';
  forum: string;
  /** A number caps the free preview; 'all' means unlimited. */
  practiceQuestionsPerSubchapter: number | 'all';
}

export interface Blueprint {
  activeScheme: string;
  activeWeightage: string;
  schemes: Record<string, ExamScheme>;
  alternateSchemes: Record<string, ExamScheme>;
  weightage: Record<
    string,
    { label: string; status: string; chapters: Record<string, number> }
  >;
  tiers: { free: TierConfig };
  dailyCapsule: {
    questionsPerDay: number;
    marksPerQuestion: number;
    durationMinutes: number;
    freeForAllUsers: boolean;
  };
  attribution: { preparedBy: string; adminName: string };
}

// -----------------------------------------------------------------------------
// Site configuration — content/site.json, edited by the administrator
// -----------------------------------------------------------------------------

export type SocialIcon =
  | 'facebook'
  | 'instagram'
  | 'youtube'
  | 'linkedin'
  | 'tiktok'
  | 'whatsapp'
  | 'telegram'
  | 'x'
  | 'github'
  | 'website';

export interface SocialLink {
  label: string;
  url: string;
  icon: SocialIcon;
  enabled: boolean;
}

export interface SiteConfig {
  brand: {
    name: string;
    tagline: string;
    shortName: string;
    description: string;
  };
  preparedBy: {
    name: string;
    role: string;
    blurb: string;
    email?: string;
    showEmail?: boolean;
  };
  social: SocialLink[];
  /**
   * Contact details shown in the footer and on the About page. There is no
   * payment configuration: every part of this portal is free to everyone.
   */
  contact?: {
    whatsapp?: string;
    viber?: string;
    email?: string;
    hours?: string;
  };
  legal: {
    disclaimer: string;
    necWebsite: string;
  };
}

/**
 * One published offline edition. Written by tools/upload-library.mjs, which
 * uploads the generated PDF and Word files and records where they landed.
 *
 * The manifest is the only record of those URLs: the files themselves are
 * gitignored, so nothing else in the repository knows they exist.
 */
export interface LibraryFile {
  /** Repository-relative source path. Stable, and the manifest's identity. */
  path: string;
  title: string;
  group: string;
  kind: 'pdf' | 'docx';
  bytes: number;
  key: string;
  url: string;
}

export interface Library {
  generatedAt: string;
  files: LibraryFile[];
}
