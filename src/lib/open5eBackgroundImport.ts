import { fetchAll, fetchAllFromDocuments, rulesetForDocument, slugifyKey } from "@/lib/open5eApi";
import type { Open5eDocumentRef } from "@/lib/open5eApi";
import type { AbilityScoreKey, BackgroundInsert } from "@/types/background.types";
import { ABILITY_SCORE_KEYS } from "@/types/background.types";
import type { RulesetKey } from "@/types/ruleset.types";
import { parseOriginFeatText } from "@/lib/backgroundAsi";

interface Open5eV2Document extends Open5eDocumentRef {
  publication_date?: string | null;
}

interface Open5eBenefit {
  name: string;
  desc: string;
  type: string;
}

interface Open5eV2Background {
  key: string;
  name: string;
  desc: string;
  benefits: Open5eBenefit[];
  document: Open5eDocumentRef;
}

export interface Open5eDocument {
  slug: string;
  title: string;
  ruleset: RulesetKey | null;
}

const DOCUMENTS_URL = "https://api.open5e.com/v2/documents/";
const BACKGROUNDS_URL = "https://api.open5e.com/v2/backgrounds/";

function splitProficiencies(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "—" || trimmed === "-" || trimmed.toLowerCase() === "none") return [];
  if (/\b(either|your choice|from among|between|plus|choose)\b/i.test(trimmed)) {
    return [trimmed.replace(/\s*\.\s*$/, "")];
  }
  return trimmed.split(/[,;]|\band\b/i).map(value => value.trim()).filter(Boolean);
}

function benefit(background: Open5eV2Background, type: string): Open5eBenefit | undefined {
  return background.benefits?.find(entry => entry.type === type);
}

const ABILITY_SCORE_KEY_SET: ReadonlySet<string> = new Set(ABILITY_SCORE_KEYS);

/**
 * Open5e 2024 backgrounds ship their ASI trio as a comma-separated list of full
 * ability names in the `ability_score` benefit, e.g. "Intelligence, Wisdom, Charisma".
 * Returns null unless all three parse cleanly — a partial/malformed trio can't
 * drive the +2/+1 vs +1/+1/+1 picker, so we'd rather surface nothing than a lie.
 */
function parseAbilityTrio(desc: string | null | undefined): AbilityScoreKey[] | null {
  if (!desc) return null;
  const trio = desc
    .split(",")
    .map(part => part.trim().toLowerCase())
    .filter((part): part is AbilityScoreKey => ABILITY_SCORE_KEY_SET.has(part));
  return trio.length === 3 ? trio : null;
}

function mapBackground(
  background: Open5eV2Background,
  documents: Map<string, Open5eV2Document>,
): BackgroundInsert {
  const documentMetadata = documents.get(background.document.key);
  const document: Open5eDocumentRef = documentMetadata ?? background.document;
  const feature = benefit(background, "feature")
    ?? benefit(background, "adventures_and_advancement")
    ?? background.benefits?.find(entry => ![
      "ability_score", "equipment", "feat", "language", "skill_proficiency",
      "tool_proficiency", "suggested_characteristics", "connection_and_memento",
    ].includes(entry.type));
  const feat = benefit(background, "feat");

  return {
    name: background.name,
    description: background.desc?.trim() || null,
    skill_proficiencies: splitProficiencies(benefit(background, "skill_proficiency")?.desc),
    tool_proficiencies: splitProficiencies(benefit(background, "tool_proficiency")?.desc),
    languages: splitProficiencies(benefit(background, "language")?.desc),
    equipment: benefit(background, "equipment")?.desc?.trim() || null,
    feature_name: feature?.name?.trim() || null,
    feature_description: feature?.desc?.trim() || null,
    feat_grant_name: feat?.desc?.trim() || null,
    feat_grant_description: null,
    asi_ability_trio: parseAbilityTrio(benefit(background, "ability_score")?.desc),
    origin_feat: parseOriginFeatText(feat?.desc),
    suggested_characteristics: benefit(background, "suggested_characteristics")?.desc?.trim() || null,
    tags: [],
    source: document.key,
    source_title: document.display_name || document.name,
    source_url: document.permalink ?? null,
    open5e_import: true,
    image_url: null,
    focal_point: null,
    ruleset: rulesetForDocument(document),
    conceptual_key: slugifyKey(background.name),
    source_document_key: document.key,
    source_record_key: background.key,
    source_revision: documentMetadata?.publication_date ?? document.name,
    source_license: documentMetadata?.licenses?.map(license => license.key).join(", ") || null,
    provenance: {
      provider: "open5e-v2",
      document: {
        key: document.key,
        name: document.name,
        publisher: document.publisher ?? null,
        gamesystem: document.gamesystem ?? null,
        permalink: document.permalink ?? null,
      },
    },
  };
}

export async function fetchOpen5eDocuments(): Promise<Open5eDocument[]> {
  const documents = await fetchAll<Open5eV2Document>(DOCUMENTS_URL);
  return documents
    .map(document => ({
      slug: document.key,
      title: document.display_name || document.name,
      ruleset: rulesetForDocument(document),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Fetch V2 records without collapsing equal names from different documents.
 * Fetches `/v2/documents/` exactly once: previously this both called
 * `fetchSupported5eDocumentKeys()` (its own internal `/v2/documents/` fetch,
 * used only to derive the default document-key scope) and separately fetched
 * the full document rows again for the id → metadata map used by
 * `mapBackground`. Fetching once and deriving both from the same rows avoids
 * the duplicate round trip.
 */
export async function fetchBackgrounds(sourceKeys?: string[]): Promise<BackgroundInsert[]> {
  const documentRows = await fetchAll<Open5eV2Document>(DOCUMENTS_URL);
  const documentKeys = sourceKeys?.length
    ? sourceKeys
    : documentRows.filter(document => rulesetForDocument(document) !== null).map(document => document.key);
  const raw = await fetchAllFromDocuments<Open5eV2Background>(BACKGROUNDS_URL, documentKeys);
  const documents = new Map(documentRows.map(document => [document.key, document]));
  return raw.map(background => mapBackground(background, documents));
}
