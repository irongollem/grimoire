import type { AiProvenance } from "../../supabase/functions/_shared/provenance/types.ts";
/**
 * The campaign's canon (#1226): one table, `canon_entries`, holding the
 * premise, the truths, the forces, the secrets, the open questions, the lore
 * and the chronicle. The union literals mirror the migration's check
 * constraints; the MCP registry holds its enums equal to these.
 */
export const CANON_PARTS = [
  "premise",
  "truth",
  "force",
  "secret",
  "question",
  "lore",
  "chronicle",
] as const;
export type CanonPart = (typeof CANON_PARTS)[number];

/** Set only when `part` is `premise`. */
export const PREMISE_KINDS = ["pitch", "theme", "table", "voice", "look", "line", "veil"] as const;
export type PremiseKind = (typeof PREMISE_KINDS)[number];

/** Set only when `part` is `truth`. */
export const KNOWLEDGE_MARKS = ["all", "some", "secret"] as const;
export type KnowledgeMark = (typeof KNOWLEDGE_MARKS)[number];

export interface CanonEntry {
  id: string;
  user_id: string;
  campaign_id: string;
  part: CanonPart;
  premise_kind: PremiseKind | null;
  knowledge: KnowledgeMark | null;
  title: string;
  /** Tiptap JSON string. */
  body: string | null;
  sort_order: number;
  player_visible_to: string[];
  image_url: string | null;
  ai_provenance: AiProvenance | null;
  created_at: string;
  updated_at: string;
}
