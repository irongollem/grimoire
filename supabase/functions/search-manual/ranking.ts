/**
 * Pure logic for the `search-manual` edge function (#1061): payload validation,
 * the Jev question, and turning its answer into at most three suggested pages.
 *
 * Deliberately Deno-free so vitest imports it directly, like import-match's
 * matching.ts. The substring search in the manual stays the fast path; this
 * only runs when that finds nothing.
 */

/** The option the model picks when no page covers the question. */
export const NONE_OPTION = "none";
export const QUESTION_NAME = "page";
export const MIN_QUERY_LENGTH = 8;
export const MAX_QUERY_LENGTH = 300;
export const MAX_PAGES = 150;
export const MAX_ID_LENGTH = 80;
export const MAX_TITLE_LENGTH = 120;
export const MAX_SUMMARY_LENGTH = 300;
export const MAX_SUGGESTIONS = 3;

/**
 * A first setting, to be confirmed by a live check against the real model:
 * a page needs at least this share of the probability to be offered.
 */
export const SUGGEST_MIN_PROBABILITY = 0.08;
/** `none` leading with at least this probability means the question is not about the app. */
export const NONE_DECISIVE_PROBABILITY = 0.5;

export interface ManualPageInput {
  id: string;
  title: string;
  /** Some manual pages have no summary; the option description is then the title alone. */
  summary?: string;
}

export interface SearchManualRequest {
  campaignId: string;
  query: string;
  pages: ManualPageInput[];
}

export interface Suggestion {
  id: string;
  probability: number;
}

export class PayloadValidationError extends Error {}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Validates the body and returns only the fields this function uses; anything else is ignored. */
export function validatePayload(body: unknown): SearchManualRequest {
  if (!isRecord(body)) throw new PayloadValidationError("Invalid request body.");
  const { campaignId, query, pages } = body;
  if (typeof campaignId !== "string" || campaignId.trim() === "") {
    throw new PayloadValidationError("campaignId is required.");
  }
  if (typeof query !== "string") throw new PayloadValidationError("query is required.");
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH || trimmed.length > MAX_QUERY_LENGTH) {
    throw new PayloadValidationError(`query must be ${MIN_QUERY_LENGTH} to ${MAX_QUERY_LENGTH} characters.`);
  }
  if (!Array.isArray(pages) || pages.length < 1 || pages.length > MAX_PAGES) {
    throw new PayloadValidationError(`pages must hold 1 to ${MAX_PAGES} entries.`);
  }

  const seen = new Set<string>();
  const out: ManualPageInput[] = [];
  for (const raw of pages) {
    if (!isRecord(raw)) throw new PayloadValidationError("Each page must be an object.");
    const { id, title, summary } = raw;
    if (typeof id !== "string" || id === "" || id.length > MAX_ID_LENGTH) {
      throw new PayloadValidationError("Each page needs an id of 1 to 80 characters.");
    }
    // The id is an option name in the question; `none` would collide with the escape option.
    if (id === NONE_OPTION) throw new PayloadValidationError(`A page id cannot be "${NONE_OPTION}".`);
    if (seen.has(id)) throw new PayloadValidationError("Page ids must be unique.");
    seen.add(id);
    if (typeof title !== "string" || title === "" || title.length > MAX_TITLE_LENGTH) {
      throw new PayloadValidationError("Each page needs a title of 1 to 120 characters.");
    }
    if (summary !== undefined && typeof summary !== "string") {
      throw new PayloadValidationError("A page summary must be text.");
    }
    out.push({ id, title, summary: summary === undefined ? undefined : summary.slice(0, MAX_SUMMARY_LENGTH) });
  }
  return { campaignId: campaignId.trim(), query: trimmed, pages: out };
}

/** The shape of the one Choice question, sent as the TypeSafe `questions` entry. */
export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface ManualJudgeRequest {
  state: { question: string };
  questions: Record<string, ChoiceQuestion>;
}

export function buildJudgeRequest(query: string, pages: readonly ManualPageInput[]): ManualJudgeRequest {
  const criteria: Record<string, string> = {};
  for (const page of pages) {
    criteria[page.id] = page.summary ? `${page.title}: ${page.summary}` : page.title;
  }
  criteria[NONE_OPTION] = "The question is not about using this app, or no page covers it.";
  return {
    state: { question: query },
    questions: {
      [QUESTION_NAME]: {
        type: "choice",
        instructions: "Which page of this app's manual best answers `question`?",
        criteria,
      },
    },
  };
}

/** The named Choice answer's per-option probabilities, or null when absent or not a Choice. */
export function choiceProbabilities(answers: unknown, name: string): Record<string, number> | null {
  if (!isRecord(answers)) return null;
  const answer = answers[name];
  if (!isRecord(answer) || answer.type !== "choice") return null;
  const probabilities = answer.probabilities;
  if (!isRecord(probabilities)) return null;
  const out: Record<string, number> = {};
  for (const [option, p] of Object.entries(probabilities)) {
    if (typeof p === "number" && Number.isFinite(p)) out[option] = p;
  }
  return out;
}

/**
 * Pages to offer, best first. Empty when `none` is the single most probable
 * option and holds at least half; ids the model returns that were not sent
 * (a hallucinated page) are dropped.
 */
export function rankSuggestions(probabilities: Record<string, number>, sentIds: ReadonlySet<string>): Suggestion[] {
  const entries = Object.entries(probabilities);
  const noneP = probabilities[NONE_OPTION];
  if (noneP !== undefined && noneP >= NONE_DECISIVE_PROBABILITY) {
    const noneLeads = entries.every(([option, p]) => option === NONE_OPTION || p < noneP);
    if (noneLeads) return [];
  }
  return entries
    .filter(([id, p]) => id !== NONE_OPTION && sentIds.has(id) && p >= SUGGEST_MIN_PROBABILITY)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SUGGESTIONS)
    .map(([id, probability]) => ({ id, probability }));
}
