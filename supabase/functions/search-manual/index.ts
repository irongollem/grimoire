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
import { withCors } from "../_shared/cors.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { judge, JEV_MODEL } from "../_shared/typesafe.ts";
import { recordFreeGeneration } from "../_shared/credits.ts";
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const NOT_JUDGED = { suggestions: [], judged: false };

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response("Unauthorized", { status: 401 });
  const userId = user.id;

  const accountRefusal = await generationRefusal(admin, userId, { failClosed: true });
  if (accountRefusal) return accountRefusal;

  let payload: ReturnType<typeof validatePayload>;
  try {
    payload = validatePayload(await req.json().catch(() => null));
  } catch (e) {
    return json({ error: e instanceof PayloadValidationError ? e.message : "Invalid request body." }, 400);
  }

  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .select("id, user_id, ai_enabled")
    .eq("id", payload.campaignId)
    .maybeSingle();
  if (campaignError) {
    console.error("search-manual could not read the campaign:", campaignError.message);
    return json({ error: "Could not read the campaign." }, 500);
  }
  if (!campaign) return new Response("Campaign not found", { status: 404 });

  if (campaign.user_id !== userId) {
    const { data: membership, error: memberError } = await admin
      .from("campaign_members").select("role")
      .eq("campaign_id", campaign.id).eq("user_id", userId).maybeSingle();
    if (memberError) {
      console.error("search-manual could not read membership:", memberError.message);
      return json({ error: "Could not read the campaign." }, 500);
    }
    if (!membership) return new Response("Forbidden", { status: 403 });
  }

  if (campaign.ai_enabled !== true) return new Response("AI is disabled for this campaign", { status: 403 });

  if (!(await checkRateLimit(admin, userId, "ai_generation"))) {
    return json({ error: "rate_limited" }, 429);
  }

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
