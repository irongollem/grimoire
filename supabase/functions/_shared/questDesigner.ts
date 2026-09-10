/**
 * Pure logic for the Quest Designer (#873): a conversational, multi-turn
 * beat-tree design flow. The DM writes prose describing a quest; the model
 * proposes a beat tree (the #822 `QuestHookResult` shape) and, where a fork
 * is genuinely ambiguous, asks back with a question naming the beat, why the
 * tree can't be placed without an answer, and 2-4 concrete options.
 *
 * Turns are STATELESS by design (#823's conclusion) — nothing in this
 * codebase holds a conversation server-side, and the shared text call
 * (`callText`) is one system + one user message across all three providers.
 * Every turn re-sends the prose, the previous tree, and every answer given so
 * far; the model returns the full revised tree plus any remaining questions.
 * "Revise only what the answers affect" is a prompt rule (see the
 * `quest_designer` system prompt), not something enforced here — this module
 * only builds the per-turn user content and validates/repairs what comes
 * back.
 *
 * This file has no Deno-specific imports (no `std/`, no `https://` specifier,
 * no Supabase client), so it is unit-tested with vitest like every other pure
 * `_shared` module (see `questDesigner.test.ts` and `vitest.config.ts`'s
 * `supabase/functions/**` include, which exists for exactly this class of
 * file) rather than `deno test`.
 */

export const QUEST_DESIGN_PROSE_LIMIT = 4000;
export const QUEST_DESIGN_TURN_BUDGET = 10;
export const QUEST_DESIGN_ANSWER_LIMIT = 500;
export const QUEST_DESIGN_MAX_QUESTIONS_PER_TURN = 3;
export const QUEST_DESIGN_MAX_ANSWERS = 40;

// A question's own text mirrors the answer-length ceiling — both are short,
// DM-authored strings shown side by side in the panel, so one limit for both
// keeps the check symmetric rather than picking a second number out of thin air.
const QUEST_DESIGN_QUESTION_TEXT_LIMIT = 500;

// Bounds the previous-tree payload the client can send back. A `QuestHookResult`
// with 12 beats, routes, objectives and tags comfortably fits in a few
// thousand characters; 60k is generous headroom against a malformed or
// runaway client without being large enough to matter as a cost vector.
const QUEST_DESIGN_TREE_MAX_JSON_CHARS = 60_000;

// ── Wire types ────────────────────────────────────────────────────────────────

export interface QuestDesignQuestionOption {
  key: string;
  label: string;
}

export interface QuestDesignQuestion {
  key: string;
  about: string | null;
  question: string;
  why: string;
  options: QuestDesignQuestionOption[];
}

export interface QuestDesignAnswer {
  /** The question's key, or "note" for a free DM note not tied to a question. */
  question_key: string;
  /** The question text as shown — the server is stateless, it needs it back. */
  question: string;
  /** The chosen option's label, or the free text. */
  answer: string;
}

export interface QuestDesignTurnBody {
  campaign_id: string;
  prose: string;
  turn: number;
  /** The tree the previous turn returned; null on turn 1. Sent back verbatim,
   *  opaque to this module — it is validated only as JSON-serializable and
   *  size-bounded, never inspected field-by-field. */
  tree: Record<string, unknown> | null;
  answers: QuestDesignAnswer[];
}

// ── Request parsing ───────────────────────────────────────────────────────────

/**
 * Validate and narrow an untrusted request body. Returns the parsed body or a
 * short human-readable reason a caller turns into a 400 response.
 */
export function parseQuestDesignTurnBody(
  raw: unknown,
): { ok: true; body: QuestDesignTurnBody } | { ok: false; reason: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: "Body must be a JSON object." };
  }
  const body = raw as Record<string, unknown>;

  const campaign_id = body.campaign_id;
  if (typeof campaign_id !== "string" || !campaign_id.trim()) {
    return { ok: false, reason: "campaign_id is required." };
  }

  const prose = body.prose;
  if (typeof prose !== "string" || !prose.trim()) {
    return { ok: false, reason: "prose is required." };
  }
  if (prose.length > QUEST_DESIGN_PROSE_LIMIT) {
    return {
      ok: false,
      reason: `prose exceeds the ${QUEST_DESIGN_PROSE_LIMIT}-character limit (got ${prose.length}).`,
    };
  }

  const turn = body.turn;
  if (typeof turn !== "number" || !Number.isInteger(turn) || turn < 1 || turn > QUEST_DESIGN_TURN_BUDGET) {
    return { ok: false, reason: `turn must be an integer between 1 and ${QUEST_DESIGN_TURN_BUDGET}.` };
  }

  const treeRaw = body.tree;
  let tree: Record<string, unknown> | null;
  if (treeRaw === null || treeRaw === undefined) {
    tree = null;
  } else if (typeof treeRaw === "object" && !Array.isArray(treeRaw)) {
    let serialized: string;
    try {
      serialized = JSON.stringify(treeRaw);
    } catch {
      return { ok: false, reason: "tree must be JSON-serializable." };
    }
    if (serialized.length > QUEST_DESIGN_TREE_MAX_JSON_CHARS) {
      return { ok: false, reason: "tree is too large." };
    }
    tree = treeRaw as Record<string, unknown>;
  } else {
    return { ok: false, reason: "tree must be an object or null." };
  }

  const answersRaw = body.answers;
  if (!Array.isArray(answersRaw)) {
    return { ok: false, reason: "answers must be an array." };
  }
  if (answersRaw.length > QUEST_DESIGN_MAX_ANSWERS) {
    return { ok: false, reason: `answers exceeds the ${QUEST_DESIGN_MAX_ANSWERS}-entry limit.` };
  }

  const answers: QuestDesignAnswer[] = [];
  for (const entry of answersRaw) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return { ok: false, reason: "each answer must be an object." };
    }
    const { question_key, question, answer } = entry as Record<string, unknown>;

    if (typeof question_key !== "string" || !question_key.trim()) {
      return { ok: false, reason: "each answer needs a question_key." };
    }
    if (
      typeof question !== "string" || !question.trim() ||
      question.length > QUEST_DESIGN_QUESTION_TEXT_LIMIT
    ) {
      return {
        ok: false,
        reason: `each answer needs a question no longer than ${QUEST_DESIGN_QUESTION_TEXT_LIMIT} characters.`,
      };
    }
    if (
      typeof answer !== "string" || !answer.trim() ||
      answer.length > QUEST_DESIGN_ANSWER_LIMIT
    ) {
      return {
        ok: false,
        reason: `each answer must be 1-${QUEST_DESIGN_ANSWER_LIMIT} characters.`,
      };
    }

    answers.push({ question_key, question, answer });
  }

  return { ok: true, body: { campaign_id, prose, turn, tree, answers } };
}

// ── Per-turn user content ────────────────────────────────────────────────────

/**
 * Build the per-turn USER message: the wrapped DM prose, the retrieved-entity
 * block (built by the caller, exactly like generate-quest), and a turn
 * section — either the turn-1 instruction, or the previous tree plus every
 * answer given so far, oldest first.
 *
 * `wrap` is injected (rather than importing `wrapUserInput` directly) so this
 * pure module has no dependency on `ai-prompt.ts` and stays trivially testable.
 */
export function buildQuestDesignerUserContent(
  input: { prose: string; entityBlock: string; turn: number; tree: unknown; answers: QuestDesignAnswer[] },
  wrap: (s: string) => string,
): string {
  const { prose, entityBlock, turn, tree, answers } = input;

  const turnSection = turn <= 1
    ? "This is the first turn. Propose the whole tree and ask what you must."
    : [
      "Previous tree (revise only what the answers affect):",
      JSON.stringify(tree),
      "Answers so far:",
      ...answers.map((a) =>
        a.question_key === "note"
          ? `- DM note: "${a.answer}"`
          : `- [${a.question_key}] "${a.question}" → "${a.answer}"`
      ),
      "Return the full revised tree and any remaining questions.",
    ].join("\n");

  return `${wrap(prose)}${entityBlock}\n\n--- turn ${turn} ---\n${turnSection}`;
}

// ── Output sanitising ─────────────────────────────────────────────────────────

/**
 * Sanitise the model's proposed questions: drops any with a blank key or
 * question text, drops options with a blank key/label then drops the whole
 * question if fewer than 2 options survive, trims a surviving question to at
 * most 4 options, drops a question whose key repeats one already kept, and
 * caps the result at `QUEST_DESIGN_MAX_QUESTIONS_PER_TURN`.
 */
function sanitizeQuestions(raw: unknown): QuestDesignQuestion[] {
  if (!Array.isArray(raw)) return [];

  const seenKeys = new Set<string>();
  const result: QuestDesignQuestion[] = [];

  for (const entry of raw) {
    if (result.length >= QUEST_DESIGN_MAX_QUESTIONS_PER_TURN) break;
    if (typeof entry !== "object" || entry === null) continue;
    const q = entry as Record<string, unknown>;

    const key = typeof q.key === "string" ? q.key.trim() : "";
    const question = typeof q.question === "string" ? q.question.trim() : "";
    if (!key || !question || seenKeys.has(key)) continue;

    const about = typeof q.about === "string" && q.about.trim() ? q.about.trim() : null;
    const why = typeof q.why === "string" ? q.why.trim() : "";

    const rawOptions = Array.isArray(q.options) ? q.options : [];
    const options: QuestDesignQuestionOption[] = [];
    for (const opt of rawOptions) {
      if (options.length >= 4) break;
      if (typeof opt !== "object" || opt === null) continue;
      const o = opt as Record<string, unknown>;
      const optionKey = typeof o.key === "string" ? o.key.trim() : "";
      const label = typeof o.label === "string" ? o.label.trim() : "";
      if (!optionKey || !label) continue;
      options.push({ key: optionKey, label });
    }
    if (options.length < 2) continue;

    seenKeys.add(key);
    result.push({ key, about, question, why, options });
  }

  return result;
}

/**
 * Turn the model's untrusted JSON output into the response shape, or null
 * when it can't be trusted at all: `tree` missing, or `tree.beats` not a
 * non-empty array. A tree without beats is not "settled with no beats" — the
 * whole point of a turn is to propose or revise a beat tree, so this is
 * treated the same as a malformed-response 502, not a valid empty tree.
 */
export function sanitizeQuestDesignOutput(
  raw: unknown,
): { tree: Record<string, unknown>; questions: QuestDesignQuestion[]; note: string } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const tree = obj.tree;
  if (typeof tree !== "object" || tree === null || Array.isArray(tree)) return null;
  const treeObj = tree as Record<string, unknown>;

  const beats = treeObj.beats;
  if (!Array.isArray(beats) || beats.length === 0) return null;

  const questions = sanitizeQuestions(obj.questions);
  const note = typeof obj.note === "string" ? obj.note : "";

  return { tree: treeObj, questions, note };
}
