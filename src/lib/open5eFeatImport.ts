import type { ClassFeatureInsert, FeatureType } from "@/types/feature.types";
import { fetchAllFromDocuments, fetchSupported5eDocumentKeys, rulesetForDocument, slugifyKey } from "@/lib/open5eApi";
import type { Open5eDocumentRef } from "@/lib/open5eApi";

interface Open5eV2Feat {
  key: string;
  name: string;
  desc: string;
  prerequisite: string;
  benefits: Array<{ desc: string }>;
  document: Open5eDocumentRef;
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

export function mapOpen5eV2Feat(feat: Open5eV2Feat): ClassFeatureInsert {
  const benefitDescriptions = feat.benefits?.map(benefit => benefit.desc).filter(Boolean) ?? [];
  const fullDescription = [feat.desc, ...benefitDescriptions].join("\n");
  return {
    ruleset: rulesetForDocument(feat.document),
    conceptual_key: slugifyKey(feat.name),
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
  const documentKeys = await fetchSupported5eDocumentKeys();
  const raw = await fetchAllFromDocuments<Open5eV2Feat>("https://api.open5e.com/v2/feats/", documentKeys);
  return raw.map(mapOpen5eV2Feat);
}
