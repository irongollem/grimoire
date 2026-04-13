import type { ClassFeatureInsert, FeatureType } from "@/types/feature.types";
import { fetchAll } from "@/lib/open5eApi";

// ── Open5e v1 API shapes ──────────────────────────────────────────────────────

interface Open5eFeat {
  slug: string;
  name: string;
  desc: string;
  prerequisite: string;   // e.g. "Dexterity 13 or higher" or ""
  effects_desc: string[]; // bullet-point effects
  document__slug: string;
  document__title: string;
  document__url: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert plain text description to a minimal Tiptap JSON doc. */
function textToTiptap(desc: string, effectsDesc: string[]): string {
  const paragraphs = desc
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const content: unknown[] = paragraphs.map((text) => ({
    type: "paragraph",
    content: [{ type: "text", text }],
  }));

  if (effectsDesc.length > 0) {
    content.push({
      type: "bulletList",
      content: effectsDesc.map((item) => ({
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: item.trim() }],
          },
        ],
      })),
    });
  }

  return JSON.stringify({ type: "doc", content });
}

/**
 * Heuristically detect feature_type from the description text.
 * Most feats are passive; a handful specify a reaction or bonus action usage.
 */
function detectFeatureType(desc: string): FeatureType {
  const lower = desc.toLowerCase();
  if (/\bas a reaction\b/.test(lower)) return "reaction";
  if (/\bbonus action\b/.test(lower)) return "bonus_action";
  return "passive";
}

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapFeat(feat: Open5eFeat): ClassFeatureInsert {
  return {
    campaign_id: null,
    name: feat.name,
    description: textToTiptap(feat.desc ?? "", feat.effects_desc ?? []),
    feature_type: detectFeatureType(feat.desc ?? ""),
    source: feat.document__slug ?? null,
    prerequisite: feat.prerequisite?.trim() || null,
    tags: [],
    open5e_import: true,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchSrdFeats(): Promise<ClassFeatureInsert[]> {
  const raw = await fetchAll<Open5eFeat>("https://api.open5e.com/v1/feats/");

  const seen = new Set<string>();
  return raw
    .map(mapFeat)
    .filter((f) => {
      if (seen.has(f.name)) return false;
      seen.add(f.name);
      return true;
    });
}
