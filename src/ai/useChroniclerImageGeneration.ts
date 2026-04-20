import { b64ToBlob } from "./utils";
import { uploadToBucket } from "@/lib/storage";
import { getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { IMAGE_BASE_PROMPT } from "./prompts";
import type { ChroniclerSize } from "@/types/chronicler.types";
import type { Npc } from "@/types/npc.types";
import type { Monster } from "@/types/monster.types";
import type { PartyMember } from "@/types/party.types";

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

export function extractEntityMentions(content: string | null): EntityMentionRef[] {
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
    return mentions.filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);
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
  const name  = entityName.toLowerCase();
  const tok   = token.toLowerCase().replace(/[^a-z0-9]/g, "");
  const norm  = normName(entityName);
  return (
    norm === tok ||
    norm.startsWith(tok) ||
    name.startsWith(token.toLowerCase()) ||
    tok.length >= 3 && norm.includes(tok)
  );
}

export function parseSceneEntities(
  text: string,
  npcs: Npc[] | undefined,
  monsters: Monster[] | undefined,
  partyMembers: PartyMember[] | undefined,
): ResolvedEntity[] {
  // Extract @Token — stops at whitespace and common punctuation
  const tokens = [...text.matchAll(/@([A-Za-z][^\s,.'":;!?@]*)/g)].map((m) => m[1]);
  const unique  = [...new Set(tokens)];

  const allEntities: ResolvedEntity[] = [];
  const seen = new Set<string>();

  for (const tok of unique) {
    let found: ResolvedEntity | null = null;

    for (const pm of partyMembers ?? []) {
      if (nameMatches(pm.name, tok)) {
        found = { label: pm.name, portraitUrl: pm.portrait_url ?? null, textDescription: pm.name };
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

const EDIT_URL        = "https://api.openai.com/v1/images/edits";
const GENERATE_URL    = "https://api.openai.com/v1/images/generations";

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
): string {
  const parts = [IMAGE_BASE_PROMPT];
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

export async function generateChroniclerImage(params: {
  sceneText: string;
  entities: ResolvedEntity[];
  size: ChroniclerSize;
}): Promise<string> {
  const { sceneText, entities, size } = params;
  const store = useCampaignStore();
  const apiKey = store.decryptedOpenAiKey;
  const settingPrompt = store.activeCampaign?.ai_setting_prompt ?? "";
  if (!apiKey) throw new Error("No OpenAI API key configured. Add one in Campaign Settings → AI.");

  // Collect portrait blobs and text descriptions in parallel
  const portraitBlobs: Blob[] = [];
  const textDescriptions: string[] = [];

  await Promise.all(
    entities.map(async (e) => {
      if (e.portraitUrl) {
        const blob = await fetchPortraitBlob(e.portraitUrl);
        if (blob) { portraitBlobs.push(blob); return; }
      }
      if (e.textDescription) textDescriptions.push(e.textDescription);
    }),
  );

  const prompt = buildPrompt(sceneText, textDescriptions, settingPrompt);

  let b64: string;

  if (portraitBlobs.length > 0) {
    // Multi-image edit endpoint — composes reference portraits into the scene
    const form = new FormData();
    form.append("model", "gpt-image-1.5");
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("output_format", "webp");
    form.append("n", "1");
    portraitBlobs.forEach((blob, i) => {
      form.append("image[]", new File([blob], `ref_${i}.webp`, { type: "image/webp" }));
    });
    const res = await fetch(EDIT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? `OpenAI image edit error ${res.status}`);
    }
    b64 = (await res.json()).data[0].b64_json as string;
  } else {
    // Standard generation — text-only prompt
    const res = await fetch(GENERATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "gpt-image-1.5", prompt, size, output_format: "webp" }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? `OpenAI image generation error ${res.status}`);
    }
    b64 = (await res.json()).data[0].b64_json as string;
  }

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
  return url;
}
