import type { ClassFeatureInsert, FeatureType } from "@/types/feature.types";
import type { RulesetKey } from "@/types/ruleset.types";
import { fetchAll } from "@/lib/open5eApi";

interface DocumentRef {
  key: string;
  name: string;
  display_name?: string;
  permalink?: string | null;
  publisher?: { name: string; key: string };
  gamesystem?: { name: string; key: string };
}

interface Open5eV2Feat {
  key: string;
  name: string;
  desc: string;
  prerequisite: string;
  benefits: Array<{ desc: string }>;
  document: DocumentRef;
}

function textToTiptap(desc: string, benefits: string[]): string {
  const content: unknown[] = desc.split(/\n\n+/).map(text => text.trim()).filter(Boolean)
    .map(text => ({ type: "paragraph", content: [{ type: "text", text }] }));
  if (benefits.length) {
    content.push({
      type: "bulletList",
      content: benefits.map(text => ({
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text: text.trim() }] }],
      })),
    });
  }
  return JSON.stringify({ type: "doc", content });
}

function detectFeatureType(desc: string): FeatureType {
  const lower = desc.toLowerCase();
  if (/\bas a reaction\b/.test(lower)) return "reaction";
  if (/\bbonus action\b/.test(lower)) return "bonus_action";
  return "passive";
}

function rulesetForDocument(document: DocumentRef): RulesetKey | null {
  if (document.gamesystem?.key === "5e-2024") return "2024";
  if (document.gamesystem?.key === "5e-2014" || document.gamesystem?.key === "5e") return "2014";
  return null;
}

export function mapOpen5eV2Feat(feat: Open5eV2Feat): ClassFeatureInsert {
  const benefitDescriptions = feat.benefits?.map(benefit => benefit.desc).filter(Boolean) ?? [];
  const fullDescription = [feat.desc, ...benefitDescriptions].join("\n");
  return {
    ruleset: rulesetForDocument(feat.document),
    conceptual_key: feat.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
    source_document_key: feat.document.key,
    source_record_key: feat.key,
    source_revision: feat.document.name,
    source_license: null,
    provenance: {
      provider: "open5e-v2",
      document: {
        key: feat.document.key,
        publisher: feat.document.publisher ?? null,
        gamesystem: feat.document.gamesystem ?? null,
        permalink: feat.document.permalink ?? null,
      },
    },
    campaign_id: null,
    name: feat.name,
    description: textToTiptap(feat.desc ?? "", benefitDescriptions),
    feature_type: detectFeatureType(fullDescription),
    source: feat.document.key,
    prerequisite: feat.prerequisite?.trim() || null,
    tags: [],
    open5e_import: true,
  };
}

/** Native V2 identity means equal names from different documents remain distinct. */
export async function fetchSrdFeats(): Promise<ClassFeatureInsert[]> {
  const raw = await fetchAll<Open5eV2Feat>("https://api.open5e.com/v2/feats/");
  return raw.map(mapOpen5eV2Feat);
}
