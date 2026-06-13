import { b64ToBlob } from "./utils";
import { uploadToBucket } from "@/lib/storage";
import { getCurrentUser, supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { fetchImageBasePrompt } from "./systemPrompts";
import { OPENAI_IMAGE_MODEL_KEY, getImageProvider } from "@/ai/providers/index";
import type { ChroniclerSize, ImageJobKind } from "@/types/chronicler.types";
import type { Npc } from "@/types/npc.types";
import type { Monster } from "@/types/monster.types";
import type { PartyMember } from "@/types/party.types";
import { logUsage } from "@/composables/useAiCredits";
import { waitForImageJob } from "@/ai/useImageJob";

const LOCAL_MODE_KEY = "grimoire_key_local_mode";

// ── Entity mention extraction ─────────────────────────────────────────────────

interface TiptapNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
}

export interface EntityMentionRef {
  id: string;
  entityType: "npc" | "monster" | "player";
  label: string;
}

export function extractEntityMentions(
  content: string | null,
): EntityMentionRef[] {
  if (!content) return [];
  try {
    const doc = JSON.parse(content) as TiptapNode;
    const mentions: EntityMentionRef[] = [];
    walkNodes(doc, (node) => {
      if (
        node.type === "entityMention" &&
        node.attrs?.id &&
        node.attrs?.entityType
      ) {
        mentions.push({
          id: node.attrs.id as string,
          entityType: node.attrs.entityType as EntityMentionRef["entityType"],
          label: (node.attrs.label as string) ?? "",
        });
      }
    });
    // Deduplicate by id
    return mentions.filter(
      (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i,
    );
  } catch {
    return [];
  }
}

function walkNodes(node: TiptapNode, fn: (n: TiptapNode) => void) {
  fn(node);
  node.content?.forEach((child) => walkNodes(child, fn));
}

export function extractPlainText(content: string | null): string {
  if (!content) return "";
  try {
    const doc = JSON.parse(content) as TiptapNode;
    const parts: string[] = [];
    walkNodes(doc, (node) => {
      if (node.text) parts.push(node.text);
    });
    return parts.join(" ").trim();
  } catch {
    return "";
  }
}

// ── Entity material resolution ────────────────────────────────────────────────

export interface ResolvedEntity {
  label: string;
  portraitUrl: string | null;
  textDescription: string | null;
}

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function nameMatches(entityName: string, token: string): boolean {
  const name = entityName.toLowerCase();
  const tok = token.toLowerCase().replace(/[^a-z0-9]/g, "");
  const norm = normName(entityName);
  return (
    norm === tok ||
    norm.startsWith(tok) ||
    name.startsWith(token.toLowerCase()) ||
    (tok.length >= 3 && norm.includes(tok))
  );
}

export function parseSceneEntities(
  text: string,
  npcs: Npc[] | undefined,
  monsters: Monster[] | undefined,
  partyMembers: PartyMember[] | undefined,
  groupPortraitUrl?: string | null,
): ResolvedEntity[] {
  // Extract @Token — stops at whitespace and common punctuation
  const tokens = [...text.matchAll(/@([A-Za-z][^\s,.'":;!?@]*)/g)].map(
    (m) => m[1],
  );
  const unique = [...new Set(tokens)];

  const allEntities: ResolvedEntity[] = [];
  const seen = new Set<string>();

  for (const tok of unique) {
    // @party / @Party resolves to the stored group portrait
    if (tok.toLowerCase() === "party" && groupPortraitUrl) {
      if (!seen.has("Party")) {
        seen.add("Party");
        allEntities.push({
          label: "Party",
          portraitUrl: groupPortraitUrl,
          textDescription: "The adventuring party",
        });
      }
      continue;
    }

    let found: ResolvedEntity | null = null;

    for (const pm of partyMembers ?? []) {
      if (nameMatches(pm.name, tok)) {
        found = {
          label: pm.name,
          portraitUrl: pm.portrait_url ?? null,
          textDescription: pm.name,
        };
        break;
      }
    }
    if (!found) {
      for (const npc of npcs ?? []) {
        if (nameMatches(npc.name, tok)) {
          found = {
            label: npc.name,
            portraitUrl: npc.portrait_url ?? null,
            textDescription: `${npc.name}${npc.appearance ? `: ${npc.appearance}` : ""}`,
          };
          break;
        }
      }
    }
    if (!found) {
      for (const mon of monsters ?? []) {
        if (nameMatches(mon.name, tok)) {
          found = {
            label: mon.name,
            portraitUrl: mon.image_url ?? null,
            textDescription: `${mon.name}${mon.description ? `: ${mon.description}` : ""}`,
          };
          break;
        }
      }
    }

    if (found && !seen.has(found.label)) {
      seen.add(found.label);
      allEntities.push(found);
    }
  }

  return allEntities;
}

// ── Image generation ──────────────────────────────────────────────────────────

async function fetchPortraitBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

function buildPrompt(
  sceneText: string,
  textDescriptions: string[],
  settingPrompt: string,
  imageBasePrompt: string,
): string {
  const parts = [imageBasePrompt];
  if (settingPrompt.trim()) parts.push(settingPrompt.trim());
  parts.push("\n\nCompose a scene illustration.");
  if (textDescriptions.length > 0) {
    parts.push(
      "The following characters appear — use the provided reference portraits where available, and the written descriptions for those without one:\n" +
        textDescriptions.map((d) => `• ${d}`).join("\n"),
    );
    parts.push(
      "Character rules:\n" +
        "• Render each character exactly once. If a character belongs to a group or party reference and is also named individually, depict them a single time only — never duplicate the same character in the scene unless specifically asked.\n" +
        "• Reference portraits — including any group or party portrait — define each character's face, build, and costume ONLY. Do not copy their poses, expressions, framing, or the reference's composition. Re-pose and re-stage every character naturally for this specific scene and its action.",
    );
  }
  parts.push(`\nScene: ${sceneText}`);
  return parts.join("\n");
}

export async function generateChroniclerImage(params: {
  sceneText: string;
  entities: ResolvedEntity[];
  size: ChroniclerSize;
  kind?: ImageJobKind;
}): Promise<string> {
  const { sceneText, entities, size, kind = "chronicler" } = params;
  const store = useCampaignStore();
  const imageModel =
    store.activeCampaign?.image_provider === "openai-mini"
      ? "gpt-image-1-mini"
      : ((typeof localStorage !== "undefined"
          ? localStorage.getItem(OPENAI_IMAGE_MODEL_KEY)
          : null) ?? "gpt-image-2");
  const settingPrompt = store.activeCampaign?.ai_setting_prompt ?? "";
  const campaignId = store.activeCampaign?.id;

  const isLocalMode =
    typeof localStorage !== "undefined" &&
    localStorage.getItem(LOCAL_MODE_KEY) === "local";

  // ── Server-side path (async job pattern) ───────────────────────────────────
  // Edge function returns a job id immediately; OpenAI call continues in
  // EdgeRuntime.waitUntil and the storage URL lands on the job row when ready.
  if (!isLocalMode && campaignId) {
    const portrait_urls = entities
      .filter((e) => e.portraitUrl)
      .map((e) => e.portraitUrl!);
    const text_descriptions = entities
      .map((e) => e.textDescription)
      .filter((d): d is string => !!d);

    const { data, error } = await supabase.functions.invoke(
      "generate-chronicle-image",
      {
        body: {
          campaign_id: campaignId,
          scene_text: sceneText,
          portrait_urls,
          text_descriptions,
          size,
          image_model: imageModel,
          kind,
        },
      },
    );
    // supabase-js wraps a non-2xx as a FunctionsHttpError and discards the JSON
    // body unless we read it explicitly. The edge function returns structured
    // codes like { error: "insufficient_credits", balance } that the user needs
    // to see — otherwise they get the generic "non-2xx status code" string.
    if (error) {
      let body: { error?: string; balance?: number } | null = null;
      try {
        body =
          (await (error as { context?: Response }).context?.json()) ?? null;
      } catch {
        /* not JSON */
      }
      if (body?.error === "insufficient_credits") {
        const left =
          body.balance !== undefined ? ` (${body.balance} left)` : "";
        throw new Error(
          `Insufficient credits${left}. Buy a credit pack or wait for the monthly refresh.`,
        );
      }
      throw new Error(body?.error ?? error.message);
    }
    if (data?.error) throw new Error(data.error);

    const jobId = (data as { job_id?: string }).job_id;
    if (!jobId) throw new Error("Server did not return a job id.");
    return await waitForImageJob(jobId);
  }

  // ── Client-side path (BYOK local mode) ─────────────────────────────────────
  // Resolve the campaign's chosen image provider (OpenAI, Gemini, or fal.ai)
  // from the local vault — same abstraction every other generator uses — so
  // local mode reaches full provider parity with the server-side path above.
  const provider = getImageProvider();

  // Collect portrait blobs and text descriptions in parallel
  const portraitBlobs: Blob[] = [];
  const textDescriptions: string[] = [];

  await Promise.all(
    entities.map(async (e) => {
      if (e.portraitUrl) {
        const blob = await fetchPortraitBlob(e.portraitUrl);
        if (blob) portraitBlobs.push(blob);
      }
      // Always include text description (height, appearance) even when a portrait is provided
      if (e.textDescription) textDescriptions.push(e.textDescription);
    }),
  );

  const imageBasePrompt = await fetchImageBasePrompt();
  const prompt = buildPrompt(
    sceneText,
    textDescriptions,
    settingPrompt,
    imageBasePrompt,
  );

  // Composite reference portraits into the scene when the provider supports it
  // (OpenAI edits, Gemini inline references); fal.ai is generate-only and
  // falls back to a text-only prompt.
  const { b64, usage } =
    portraitBlobs.length > 0 && provider.edit
      ? await provider.edit(portraitBlobs, prompt, size)
      : await provider.generate(prompt, size);

  logUsage({ reason: "chronicler_image", imageUsage: usage });

  // Upload to chronicle bucket
  const blob = b64ToBlob(b64, "image/webp");
  const user = getCurrentUser();
  const url = await uploadToBucket({
    bucket: "chronicle",
    blob,
    path: `${user!.id}/scene-${Date.now()}.webp`,
    contentType: "image/webp",
  });
  if (!url) throw new Error("Failed to upload scene image.");

  // Mirror the server-side behavior — gallery row creation lives here so the
  // caller sees the same outcome on both paths. Skipped for non-chronicler
  // kinds (e.g. group_portrait, which writes back to its own entity).
  if (kind === "chronicler" && campaignId && user) {
    await supabase.from("chronicler_images").insert({
      campaign_id: campaignId,
      user_id: user.id,
      image_url: url,
      prompt: sceneText.slice(0, 500),
      size,
    });
  }

  return url;
}
