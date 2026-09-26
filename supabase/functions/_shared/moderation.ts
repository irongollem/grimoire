/**
 * Pre-flight prompt screening against OpenAI's moderation endpoint, run before
 * any paid image call, plus the log that lets its thresholds be corrected.
 *
 * ── What this actually saves ────────────────────────────────────────────────
 *
 * Not an OpenAI bill, and it is worth being exact about that: gpt-image answers
 * a refused prompt with a 400 (`code: "moderation_blocked"`), and a 400 is not
 * billed. On the OpenAI path this buys a fast, honest "reword it" in place of a
 * 20-60s wait on an opaque provider error.
 *
 * The money is on **Gemini**, whose four adjustable safety filters default to
 * OFF on 2.5/3 models — so a prompt OpenAI would refuse outright is rendered
 * and billed in full there, and this screen is the only thing in front of it.
 * The third thing it buys is the calibration log below, which is what makes any
 * of these numbers improvable.
 *
 * ── Why this does NOT gate on `flagged` ──────────────────────────────────────
 *
 * It cannot. `flagged` is the union of all 13 categories, and this is a D&D
 * app: violence is the subject matter. Measured against the live endpoint on
 * 16 Sep 2026, with the exact prompts kept in moderation.test.ts:
 *
 *   a stern dwarven cleric in plate armor, painted portrait   flagged=false
 *   a tiefling rogue slitting a guard's throat, blood spray   flagged=TRUE   violence 0.866
 *   a blood-soaked barbarian cleaving an orc, entrails        flagged=TRUE   violence/graphic 0.852
 *   an orc warlord rallying troops to exterminate the elves   flagged=TRUE   violence 0.559
 *   a torture chamber, prisoner on the rack, screaming        flagged=TRUE   violence 0.517
 *
 * Five of six, and four of those five are art this app exists to make. Gating
 * on `flagged` would refuse most of a DM's library — the precise opposite of
 * the `moderation: "low"` this screen sits in front of (see imageGen.ts).
 *
 * So the gate is a per-category score table instead, and `violence`,
 * `violence/graphic`, `illicit`, `illicit/violent` and `harassment` are
 * deliberately absent from it: a fantasy renderer at moderation "low" draws
 * those, and so should we. What remains are the lines gpt-image refuses at any
 * moderation setting.
 *
 * ── The thresholds are provisional, and the log is how they stop being ───────
 *
 * They were set from eight hand-written prompts. That is enough to ship and
 * nowhere near enough to keep, so every screening writes a `prompt_screenings`
 * row, and `recordScreeningOutcome` later stamps it with what the renderer
 * actually did. Our own verdict is not ground truth: a prompt we allow at 0.89
 * that gpt-image then refuses is the evidence that a threshold sits too high,
 * and neither half of that says anything alone. `get_prompt_screening_hints`
 * (admin) reads both back.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const MODERATION_URL = "https://api.openai.com/v1/moderations";

/** Free, multimodal (text + image), 13 categories. Free is the whole premise here. */
export const MODERATION_MODEL = "omni-moderation-latest";

/**
 * Category → the `category_scores` value at or above which a prompt is refused.
 *
 * Thresholds are set from the measurements above, with headroom over the
 * highest legitimate D&D prompt seen rather than at some round number:
 *
 * - `sexual/minors` is the one absolute line, and it is cheap to hold: every
 *   prompt measured — including the explicitly pornographic control — scored
 *   0.000, so a low threshold costs nothing and false-positives on nothing.
 * - `sexual` has the narrowest margin in the table and is the one to revisit
 *   first: a scantily-armoured succubus scores 0.778 and is legitimate fantasy
 *   art, while an explicit pornographic prompt scores 0.926. 0.90 separates
 *   them, but not by much — watch `max_allowed` and `refused_after_pass` for
 *   this category in the admin calibration panel.
 * - the rest sit high, because their false-positive case is a fantasy villain
 *   (the "exterminate the elves" warlord above) and their true-positive case
 *   is unambiguous.
 */
export const IMAGE_PROMPT_THRESHOLDS: Readonly<Record<string, number>> = {
  "sexual/minors": 0.2,
  "sexual": 0.9,
  "hate/threatening": 0.85,
  "hate": 0.9,
  "self-harm/instructions": 0.85,
};

/**
 * How close to a threshold a score must come before the prompt text is kept.
 *
 * The log stores scores for everything but text only where a human would have
 * to read it to judge the call — near the line, over it, or refused by the
 * renderer after we allowed it. Anything wider turns a calibration aid into a
 * durable record of every image every DM has ever asked for.
 */
export const PROMPT_TEXT_BAND = 0.05;

/** Where a screening happens, and who to bill the row to. */
export interface ScreeningContext {
  /** OpenAI key for the classifier. Null disables screening entirely. */
  apiKey: string | null;
  admin: SupabaseClient;
  userId: string;
  /** The calling surface: entity_image, npc_portrait, map_style_generation, … */
  generationType: string;
  /** The renderer this prompt was bound for — openai | gemini. */
  imageProvider: string;
}

/** What the renderer did with a prompt we allowed. Written back by recordScreeningOutcome. */
export type ProviderOutcome = "rendered" | "refused" | "error";

/** Thrown when a prompt crosses the table above. Carries the categories for logging — never for the DM, who gets the message. */
export class PromptRejectedError extends Error {
  readonly categories: string[];

  constructor(categories: string[]) {
    super(
      "This prompt was refused by the content filter before it was sent. Reword it and try again.",
    );
    this.name = "PromptRejectedError";
    this.categories = categories;
  }
}

/** Narrow an unknown caught value, so a caller can answer 400 rather than 502. */
export function isPromptRejected(e: unknown): e is PromptRejectedError {
  return e instanceof PromptRejectedError;
}

/**
 * Which categories in `scores` reach their threshold. Pure, so the policy above
 * is testable without a network call.
 */
export function categoriesOverThreshold(
  scores: Record<string, number>,
  thresholds: Readonly<Record<string, number>> = IMAGE_PROMPT_THRESHOLDS,
): string[] {
  const over: string[] = [];
  for (const [category, limit] of Object.entries(thresholds)) {
    const score = scores[category];
    // A category the response omits has not been judged, which is not the same
    // as having been judged harmless — so it is skipped rather than read as 0.
    // The response shape belongs to OpenAI, and a renamed or retired category
    // must weaken this gate loudly (nothing blocked) rather than silently
    // (everything scored zero and passing).
    if (score === undefined) continue;
    if (score >= limit) over.push(category);
  }
  return over;
}

/**
 * Whether any gated category came within PROMPT_TEXT_BAND of its threshold —
 * the test for keeping the prompt text. Exported for the same reason
 * categoriesOverThreshold is: the privacy rule should be checkable directly.
 */
export function isNearThreshold(
  scores: Record<string, number>,
  thresholds: Readonly<Record<string, number>> = IMAGE_PROMPT_THRESHOLDS,
  band: number = PROMPT_TEXT_BAND,
): boolean {
  for (const [category, limit] of Object.entries(thresholds)) {
    const score = scores[category];
    if (score === undefined) continue;
    if (score >= limit - band) return true;
  }
  return false;
}

/** The screening's log row, so the outcome can be written back to it. Null when nothing was logged. */
export interface ScreeningRecord {
  id: string | null;
}

async function logScreening(
  ctx: ScreeningContext,
  scores: Record<string, number>,
  over: string[],
  prompt: string,
): Promise<string | null> {
  // Text only where it will actually be read — see PROMPT_TEXT_BAND.
  const keepText = over.length > 0 || isNearThreshold(scores);
  try {
    const { data, error } = await ctx.admin
      .from("prompt_screenings")
      .insert({
        user_id: ctx.userId,
        generation_type: ctx.generationType,
        image_provider: ctx.imageProvider,
        blocked: over.length > 0,
        categories_over: over,
        scores,
        thresholds: IMAGE_PROMPT_THRESHOLDS,
        prompt: keepText ? prompt : null,
      })
      .select("id")
      .single();
    if (error) {
      console.error("Failed to log prompt screening:", error);
      return null;
    }
    return data.id as string;
  } catch (e) {
    // Logging must never be the reason an image fails to render.
    console.error("Failed to log prompt screening:", e);
    return null;
  }
}

/**
 * Stamp a screening row with what the renderer did.
 *
 * `prompt` is passed only on a refusal: a prompt we allowed and the renderer
 * then refused is exactly the row a human needs to read, and at screen time we
 * could not know it would become one — its score may have been nowhere near a
 * threshold, which is the whole finding.
 */
export async function recordScreeningOutcome(
  admin: SupabaseClient,
  id: string,
  outcome: ProviderOutcome,
  prompt?: string,
): Promise<void> {
  try {
    const { error } = await admin
      .from("prompt_screenings")
      .update(outcome === "refused" && prompt ? { provider_outcome: outcome, prompt } : { provider_outcome: outcome })
      .eq("id", id);
    if (error) console.error("Failed to record screening outcome:", error);
  } catch (e) {
    console.error("Failed to record screening outcome:", e);
  }
}

/**
 * Screen an image prompt. Returns the log row's id when the prompt is
 * acceptable — or unscreenable — and throws `PromptRejectedError` when it is
 * not.
 *
 * **This fails open, on purpose.** If the endpoint 404s (the model not enabled
 * on the account), rate-limits, or the network drops, image generation
 * continues unscreened. The screen is a cost optimisation in front of the
 * renderer's own moderation, not the safety boundary: gpt-image still applies
 * `moderation: "low"` and Gemini still applies its non-configurable image
 * filters, whatever happens here. Failing closed would trade a saved fraction
 * of a cent for an outage across all eight image features every time OpenAI
 * has a bad minute, and would do it for the DM whose prompt was fine.
 */
export async function screenImagePrompt(
  prompt: string,
  ctx: ScreeningContext,
): Promise<ScreeningRecord> {
  if (!ctx.apiKey) return { id: null };

  let scores: Record<string, number>;

  try {
    const res = await fetch(MODERATION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.apiKey}` },
      body: JSON.stringify({ model: MODERATION_MODEL, input: prompt }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error("Prompt screening unavailable:", res.status, body?.error?.message ?? "");
      return { id: null };
    }
    const data = await res.json();
    const result = data?.results?.[0];
    if (!result?.category_scores) {
      console.error("Prompt screening returned no scores; proceeding unscreened.");
      return { id: null };
    }
    scores = result.category_scores as Record<string, number>;
  } catch (e) {
    console.error("Prompt screening failed:", e);
    return { id: null };
  }

  const over = categoriesOverThreshold(scores);
  const id = await logScreening(ctx, scores, over, prompt);

  if (over.length > 0) {
    console.warn("Prompt refused before render:", over.join(", "));
    throw new PromptRejectedError(over);
  }
  return { id };
}
