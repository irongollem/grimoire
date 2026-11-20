/**
 * Manual question search (#1061): when the in-app manual's substring search
 * finds nothing, the client sends the typed question here and Jev (TypeSafe)
 * says which manual pages it is about.
 *
 * Gates, in order: a signed-in caller, a child account fails closed, a valid
 * body, the caller is the campaign's owner or a member (any role, the manual
 * is for players too), the campaign has `ai_enabled === true` (nothing a user
 * types goes to a model with AI off), and the `ai_generation` rate limit. No
 * `typesafe` platform key means the feature is off: `{ suggestions: [], judged:
 * false }`. Any Jev failure answers the same. The one judgment is platform-paid
 * and recorded as `entity_judgment` through `recordFreeGeneration`, so it costs
 * the user nothing.
 */
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { generationRefusal } from "../_shared/accountGate.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { judge, JEV_MODEL } from "../_shared/typesafe.ts";
import { recordFreeGeneration } from "../_shared/credits.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign } from "../_shared/pipeline/aiCampaign.ts";
import {
  buildJudgeRequest,
  choiceProbabilities,
  PayloadValidationError,
  QUESTION_NAME,
  rankSuggestions,
  validatePayload,
} from "./ranking.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const NOT_JUDGED = { suggestions: [], judged: false };

serve(serveUser(async ({ user, req }) => {
  const userId = user.id;

  const accountRefusal = await generationRefusal(admin, userId, { failClosed: true });
  if (accountRefusal) return accountRefusal;

  let payload: ReturnType<typeof validatePayload>;
  try {
    payload = validatePayload(await readJsonBody(req));
  } catch (e) {
    return jsonError(400, "invalid_body", e instanceof PayloadValidationError ? e.message : "Invalid request body.");
  }

  // Any seat at the campaign: the manual is for players too.
  const load = await loadAiCampaign(admin, payload.campaignId, userId, {
    access: "member",
    forbiddenMessage: "Only people at this campaign's table can search its manual.",
  });
  if (!load.ok) return load.response;

  if (!(await checkRateLimit(admin, userId, "ai_generation"))) return rateLimited();

  let apiKey: string | undefined;
  try {
    apiKey = (await fetchPlatformKeys(admin, ["typesafe"])).typesafe;
  } catch (e) {
    console.error("search-manual could not read the typesafe key:", e instanceof Error ? e.message : "unknown error");
    return json(NOT_JUDGED);
  }
  if (!apiKey) return json(NOT_JUDGED);

  try {
    // The Choice question type is not in the shared JudgeRequest union yet; the wire shape is the documented one.
    const request = buildJudgeRequest(payload.query, payload.pages);
    const res = await judge(request, { apiKey });
    // Free to the user and outside any credit hold, so it is recorded directly.
    await recordFreeGeneration(admin, userId, "entity_judgment", {
      model: JEV_MODEL,
      provider: "typesafe",
      input_tokens: res.inputTokens,
    });
    const probabilities = choiceProbabilities(res.answers, QUESTION_NAME);
    if (!probabilities) return json(NOT_JUDGED);
    const suggestions = rankSuggestions(probabilities, new Set(payload.pages.map((p) => p.id)));
    return json({ suggestions, judged: true });
  } catch (e) {
    // The error never carries the question or the key (typesafe.ts), but log only the message anyway.
    console.error("search-manual judgment failed:", e instanceof Error ? e.message : "unknown error");
    return json(NOT_JUDGED);
  }
}));
