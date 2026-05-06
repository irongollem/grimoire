import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptValue } from "../_shared/vault.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function buildPrompt(sceneText: string, textDescriptions: string[], settingPrompt: string, imageBasePrompt: string): string {
  const parts = [imageBasePrompt];
  if (settingPrompt.trim()) parts.push(settingPrompt.trim());
  parts.push("\n\nCompose a scene illustration.");
  if (textDescriptions.length > 0) {
    parts.push(
      "The following characters appear — use the provided reference portraits where available, and the written descriptions for those without one:\n" +
      textDescriptions.map((d) => `• ${d}`).join("\n"),
    );
  }
  parts.push(`\nScene: ${sceneText}`);
  return parts.join("\n");
}

// ── Usage logging ─────────────────────────────────────────────────────────────

async function logUsage(userId: string, isByok: boolean, model: string): Promise<void> {
  await admin.from("ai_credit_ledger").insert({
    user_id: userId, delta: 0, reason: "chronicler_image", is_byok: isByok,
    model, provider: "openai", image_count: 1,
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────

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

  let campaign_id: string, scene_text: string, portrait_urls: string[],
      text_descriptions: string[], size: string, image_model: string;

  try {
    const body = await req.json();
    campaign_id       = body.campaign_id;
    scene_text        = body.scene_text;
    portrait_urls     = Array.isArray(body.portrait_urls) ? body.portrait_urls : [];
    text_descriptions = Array.isArray(body.text_descriptions) ? body.text_descriptions : [];
    size              = body.size ?? "1024x1024";
    image_model       = body.image_model ?? "gpt-image-2";
    if (!campaign_id || !scene_text) throw new Error("invalid");
  } catch {
    return new Response("Invalid body — need { campaign_id, scene_text }", { status: 400 });
  }

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, ai_setting_prompt, openai_api_key")
    .eq("id", campaign_id)
    .maybeSingle();
  if (!campaign) return new Response("Campaign not found", { status: 404 });

  if (campaign.user_id !== user.id) {
    const { data: membership } = await admin
      .from("campaign_members").select("role")
      .eq("campaign_id", campaign_id).eq("user_id", user.id).maybeSingle();
    if (!membership) return new Response("Forbidden", { status: 403 });
  }

  const campaignOpenai = campaign.openai_api_key
    ? await decryptValue(campaign.openai_api_key).catch(() => null)
    : null;
  const platformKeys = !campaignOpenai ? await fetchPlatformKeys(admin, ["openai"]) : {};
  const openaiKey = campaignOpenai ?? platformKeys.openai ?? null;
  const isByok = !!campaignOpenai;
  if (!openaiKey) return new Response("No OpenAI API key configured", { status: 422 });

  const settingPrompt = campaign.ai_setting_prompt ?? "";

  const { data: imageBaseRow } = await admin
    .from("ai_system_prompts").select("content")
    .eq("generator_type", "image_base").maybeSingle();
  const imageBasePrompt = imageBaseRow?.content ?? "";

  const prompt = buildPrompt(scene_text, text_descriptions, settingPrompt, imageBasePrompt);

  // Fetch portrait blobs in parallel (server-side)
  const portraitBlobs: Blob[] = [];
  if (portrait_urls.length > 0) {
    const results = await Promise.allSettled(
      portrait_urls.map((url) => fetch(url).then((r) => r.ok ? r.blob() : null)),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) portraitBlobs.push(r.value);
    }
  }

  let b64: string;

  try {
    if (portraitBlobs.length > 0) {
      const form = new FormData();
      form.append("model", image_model);
      form.append("prompt", prompt);
      form.append("size", size);
      form.append("output_format", "webp");
      form.append("n", "1");
      portraitBlobs.forEach((blob, i) => {
        form.append("image[]", new File([blob], `ref_${i}.webp`, { type: "image/webp" }));
      });
      const res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `OpenAI image edit error ${res.status}`);
      }
      b64 = (await res.json()).data[0].b64_json as string;
    } else {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({ model: image_model, prompt, size, output_format: "webp" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `OpenAI image generation error ${res.status}`);
      }
      b64 = (await res.json()).data[0].b64_json as string;
    }
  } catch (e) {
    console.error("Chronicle image generation failed:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Image generation failed" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  await logUsage(user.id, isByok, image_model).catch(console.error);

  return new Response(
    JSON.stringify({ image_b64: b64 }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
