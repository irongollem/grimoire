import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { isUserPro } from "../_shared/plan.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchCreditCost, recordGeneration, releaseCredits, reserveCredits, reservationFailureResponse } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { isAccountSuspended, suspendedResponse } from "../_shared/suspension.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
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

  // Frozen accounts cannot generate — including BYOK, which skips the credit gate.
  if (await isAccountSuspended(admin, user.id)) return suspendedResponse(cors);

  let campaign_id: string, style: string, model: string, lyrics: string | undefined;

  try {
    const body = await req.json();
    campaign_id = body.campaign_id;
    style       = body.style;
    model       = body.model ?? "lyria-3-clip-preview";
    lyrics      = body.lyrics ?? undefined;
    if (!campaign_id || !style) throw new Error("invalid");
  } catch {
    return new Response("Invalid body — need { campaign_id, style, model, lyrics? }", { status: 400 });
  }

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, ai_enabled, gemini_api_key")
    .eq("id", campaign_id)
    .maybeSingle();
  if (!campaign) return new Response("Campaign not found", { status: 404 });
  if (campaign.ai_enabled === false) return new Response("AI is disabled for this campaign", { status: 403 });

  if (campaign.user_id !== user.id) {
    const { data: membership } = await admin
      .from("campaign_members").select("role")
      .eq("campaign_id", campaign_id).eq("user_id", user.id).maybeSingle();
    if (!membership) return new Response("Forbidden", { status: 403 });
  }

  // BYOK is Pro-only: ignore stored campaign keys unless the owner is currently Pro.
  const ownerIsPro = await isUserPro(admin, campaign.user_id);
  const [campaignGemini, platformKeys, geminiProviderRow] = await Promise.all([
    (ownerIsPro && campaign.gemini_api_key)
      ? decryptValue(campaign.gemini_api_key).catch(() => null)
      : Promise.resolve(null),
    fetchPlatformKeys(admin, ["gemini"]),
    admin.from("provider_config")
      .select("audio_enabled, audio_multiplier")
      .eq("provider", "gemini")
      .maybeSingle()
      .then((r) => r.data as { audio_enabled: boolean; audio_multiplier: number | null } | null),
  ]);

  const isByok = !!campaignGemini;

  // Platform key path must respect the admin audio_enabled toggle.
  // BYOK users own their key and are never gated by the platform toggle.
  if (!isByok && !geminiProviderRow?.audio_enabled) {
    return new Response(
      JSON.stringify({ error: "Music generation is not enabled on this platform. Contact your admin." }),
      { status: 403, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const geminiKey = campaignGemini ?? platformKeys.gemini ?? null;
  if (!geminiKey) {
    return new Response(
      JSON.stringify({ error: "No Gemini API key configured. Add one in Campaign Settings → AI, or ask your admin to configure a platform key." }),
      { status: 422, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const generationType = model === "lyria-3-pro-preview" ? "music_full_song" : "music_clip";
  const baseAudioCost = isByok ? 0 : await fetchCreditCost(admin, generationType);
  const audioCost = baseAudioCost * (geminiProviderRow?.audio_multiplier ?? 1);

  // Atomic affordability gate: hold the balance for the duration of the paid
  // Lyria call so concurrent requests cannot all pass a stale balance check.
  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      { status: 429, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const reservation = await reserveCredits(admin, user.id, audioCost, generationType);
  if (!reservation.ok) {
    return reservationFailureResponse(reservation, cors);
  }

  try {
    const prompt = lyrics?.trim()
      ? `${lyrics.trim()}\n\nMusical style: ${style}`
      : style;

    const lyriaRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["AUDIO", "TEXT"] },
        }),
      },
    );

    if (!lyriaRes.ok) {
      await releaseCredits(admin, reservation.ids);
      const body = await lyriaRes.json().catch(() => ({})) as { error?: { message?: string } };
      console.error(`Lyria API error ${lyriaRes.status}:`, body?.error?.message ?? body);
      return new Response(
        JSON.stringify({ error: "Music generation failed" }),
        { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const lyriaJson = await lyriaRes.json() as {
      candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[]
    };

    const parts = lyriaJson.candidates?.[0]?.content?.parts ?? [];
    const audioPart = parts.find((p) => p.inlineData?.data);
    if (!audioPart?.inlineData?.data) {
      await releaseCredits(admin, reservation.ids);
      return new Response(
        JSON.stringify({ error: "No audio data in Lyria response." }),
        { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // Release the hold and record the real spend (one cost row, with analytics).
    await releaseCredits(admin, reservation.ids);
    await recordGeneration(admin, user.id, generationType, isByok, audioCost, {
      model,
      provider: "google",
      image_count: 1,
    }).catch(console.error);

    return new Response(
      JSON.stringify({
        audio_base64: audioPart.inlineData.data,
        mime_type: audioPart.inlineData.mimeType ?? "audio/mpeg",
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    throw e;
  }
});
