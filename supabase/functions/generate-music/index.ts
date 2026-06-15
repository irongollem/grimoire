import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptValue } from "../_shared/vault.ts";
import { isUserPro } from "../_shared/plan.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchCreditCost, fetchUserBalance, recordGeneration } from "../_shared/credits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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
    .select("id, user_id, gemini_api_key")
    .eq("id", campaign_id)
    .maybeSingle();
  if (!campaign) return new Response("Campaign not found", { status: 404 });

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
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const geminiKey = campaignGemini ?? platformKeys.gemini ?? null;
  if (!geminiKey) {
    return new Response(
      JSON.stringify({ error: "No Gemini API key configured. Add one in Campaign Settings → AI, or ask your admin to configure a platform key." }),
      { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const generationType = model === "lyria-3-pro-preview" ? "music_full_song" : "music_clip";
  const baseAudioCost = isByok ? 0 : await fetchCreditCost(admin, generationType);
  const audioCost = baseAudioCost * (geminiProviderRow?.audio_multiplier ?? 1);

  if (audioCost > 0) {
    const balance = await fetchUserBalance(admin, user.id);
    if (balance < audioCost) {
      return new Response(
        JSON.stringify({ error: "insufficient_credits", balance }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

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
    const body = await lyriaRes.json().catch(() => ({})) as { error?: { message?: string } };
    return new Response(
      JSON.stringify({ error: body?.error?.message ?? `Lyria API error ${lyriaRes.status}` }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const lyriaJson = await lyriaRes.json() as {
    candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[]
  };

  const parts = lyriaJson.candidates?.[0]?.content?.parts ?? [];
  const audioPart = parts.find((p) => p.inlineData?.data);
  if (!audioPart?.inlineData?.data) {
    return new Response(
      JSON.stringify({ error: "No audio data in Lyria response." }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

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
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
