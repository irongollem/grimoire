/**
 * Minimal TypeSafe "System One" client (the Jev judgment model, #1061).
 *
 * Plain `fetch`, no SDK: one POST to /v1/systemone carrying a `state` and a
 * set of named questions, answers typed per question. Deno-free so it is
 * unit-tested under vitest with an injected `fetch`.
 *
 * Two rules the callers rely on:
 *   - the API key and the request `state` never appear in a thrown error or a
 *     log line (the state is a DM's campaign text; the key is the platform's);
 *   - only 429 and 529 are retried (rate limit, overload). A 400/422 is a
 *     request we built wrongly, and retrying it only repeats the mistake.
 */

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
/** The alias every request asks for. Spend is recorded under it rather than under the version that answered
 *  ("jev-1.14.0"): the price in `ai_model_pricing` hangs on this name, and a version bump on TypeSafe's side must
 *  not leave the spend unpriced. */
export const JEV_MODEL = "jev-latest";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 150;

export interface ScoreQuestion {
  type: "score";
  instructions: string;
  /** One text per level, in ascending order: level 0 first. */
  criteria: string[];
}

export interface NoulQuestion {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
}

export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  /** Option name to its description: 1 to 255 options. Order can bias the answer, so keep the list short. */
  criteria: Record<string, string>;
}

export type Question = ScoreQuestion | NoulQuestion | ChoiceQuestion;

export interface JudgeRequest {
  model?: string;
  state: unknown;
  questions: Record<string, Question>;
}

export interface ScoreAnswer {
  type: "score";
  score: number;
  confidence?: number;
}

export interface NoulAnswer {
  type: "noul";
  noul: number;
}

export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export type Answer = ScoreAnswer | NoulAnswer | ChoiceAnswer;

export interface JudgeResult {
  /** The model that actually answered (e.g. "jev-1.14.0"), not the alias asked for. */
  model: string;
  answers: Record<string, Answer>;
  inputTokens: number;
}

export interface JudgeOptions {
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Injected by tests so a retry does not really wait. */
  sleep?: (ms: number) => Promise<void>;
}

/** Carries the HTTP status (0 for a network failure or timeout) and nothing from the request. */
export class TypeSafeError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(status === 0 ? "TypeSafe request failed (network or timeout)" : `TypeSafe request failed with status ${status}`);
    this.name = "TypeSafeError";
    this.status = status;
  }
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseAnswer(raw: unknown): Answer | null {
  if (!isPlainObject(raw)) return null;
  if (raw.type === "score" && typeof raw.score === "number" && Number.isFinite(raw.score)) {
    return {
      type: "score",
      score: raw.score,
      ...(typeof raw.confidence === "number" ? { confidence: raw.confidence } : {}),
    };
  }
  if (raw.type === "noul" && typeof raw.noul === "number" && Number.isFinite(raw.noul)) {
    return { type: "noul", noul: raw.noul };
  }
  if (raw.type === "choice" && typeof raw.choice === "string" && typeof raw.confidence === "number" && Number.isFinite(raw.confidence) && isPlainObject(raw.probabilities)) {
    const probabilities: Record<string, number> = {};
    for (const [option, p] of Object.entries(raw.probabilities)) {
      if (typeof p === "number" && Number.isFinite(p)) probabilities[option] = p;
    }
    return { type: "choice", choice: raw.choice, confidence: raw.confidence, probabilities };
  }
  return null;
}

function parseResponse(body: unknown): JudgeResult {
  // A 200 whose body is not the documented shape is as unusable as a failure.
  if (!isPlainObject(body) || typeof body.model !== "string" || !isPlainObject(body.answers)) {
    throw new TypeSafeError(200);
  }
  const answers: Record<string, Answer> = {};
  for (const [name, raw] of Object.entries(body.answers)) {
    const answer = parseAnswer(raw);
    if (answer) answers[name] = answer;
  }
  const usage = body.usage;
  const inputTokens = isPlainObject(usage) && typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
  return { model: body.model, answers, inputTokens };
}

/** One attempt. Returns the Response, or throws TypeSafeError(0) on network failure, timeout or caller abort. */
async function attempt(
  request: JudgeRequest,
  opts: JudgeOptions,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onCallerAbort = () => controller.abort();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", onCallerAbort, { once: true });
  }
  try {
    return await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: request.model ?? JEV_MODEL, state: request.state, questions: request.questions }),
      signal: controller.signal,
    });
  } catch {
    // The underlying error can echo the request; surface only the status.
    throw new TypeSafeError(0);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onCallerAbort);
  }
}

export async function judge(request: JudgeRequest, opts: JudgeOptions): Promise<JudgeResult> {
  const fetchImpl = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? realSleep;

  for (let tries = 0; ; tries++) {
    const res = await attempt(request, opts, fetchImpl);
    if (res.status === 200) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new TypeSafeError(200);
      }
      return parseResponse(body);
    }
    const retryable = res.status === 429 || res.status === 529;
    if (!retryable || tries >= MAX_RETRIES) throw new TypeSafeError(res.status);
    // Jittered exponential backoff: spreads a burst of 16 concurrent callers
    // that all hit the same rate limit instead of retrying in lockstep.
    await sleep(RETRY_BASE_MS * 2 ** tries * (0.5 + Math.random()));
  }
}

/** The named Score answer, or null when the response lacks it or it is another type. */
export function scoreOf(result: JudgeResult, name: string): number | null {
  const answer = result.answers[name];
  return answer && answer.type === "score" ? answer.score : null;
}

/** The named Noul answer (probability of true), or null when absent or another type. */
export function noulOf(result: JudgeResult, name: string): number | null {
  const answer = result.answers[name];
  return answer && answer.type === "noul" ? answer.noul : null;
}

/** The named Choice answer, or null when absent or another type. */
export function choiceOf(
  result: JudgeResult,
  name: string,
): { choice: string; confidence: number; probabilities: Record<string, number> } | null {
  const answer = result.answers[name];
  if (!answer || answer.type !== "choice") return null;
  return { choice: answer.choice, confidence: answer.confidence, probabilities: answer.probabilities };
}
