import type { AiProvenance } from "@/ai/provenance";
import type { GenerationJob, GenerationPlan } from "./authoringPlan";
import type { TilePackManifest } from "./packSchema";

export interface UserTilePack {
  id: string;
  user_id: string;
  pack_id: string;
  pack_version: number;
  name: string;
  description: string;
  schema_version: number;
  manifest: TilePackManifest;
  source: "upload" | "generated";
  status: "draft" | "ready" | "failed";
  created_at: string;
  updated_at: string;
  campaign_tile_packs?: { campaign_id: string }[];
}

export type GenerationRunStatus = "proof_pending" | "awaiting_approval" | "generating" | "cancelling" | "cancelled" | "completed" | "failed";

/**
 * A shared, admin-authored tile pack published to every DM (#889).
 *
 * Sibling of `UserTilePack`, not a variant of it: that one is private, Pro-gated
 * and campaign-shared, this one is platform content. The two never mix — their
 * `pack_id` spaces are disjoint by constraint (`custom-` is reserved for user
 * packs) so a `PackRef` of (pack_id, pack_version) stays unambiguous across both.
 */
export interface LibraryTilePack {
  id: string;
  pack_id: string;
  pack_version: number;
  name: string;
  description: string;
  schema_version: number;
  manifest: TilePackManifest;
  /** A publication gate, not generation progress — the run reports that.
   *  Only `published` rows are visible to non-admins, by RLS. */
  status: "draft" | "published" | "archived";
  /** Attribution: who published this body of content. `grimoire-art` for packs
   *  we author. Null for a pack that predates its source row. */
  content_source_key: string | null;
  /** What a user may do with this pack — per pack, not per source, because
   *  provenance differs per pack. `cc0` for generated ones. Empty means no
   *  licence declared, which is a real state rather than "unknown". */
  license_keys: string[];
  ai_provenance: AiProvenance | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TilePackGenerationRun {
  id: string;
  user_id: string;
  /** Null in the library lane: platform content sits in no campaign, and the
   *  column is not filled with a stand-in so that a NOT NULL could survive.
   *  A DB constraint keeps it non-null exactly when `tile_pack_id` is set. */
  campaign_id: string | null;
  /** Exactly one of these two is set — the run's lane. */
  tile_pack_id: string | null;
  library_tile_pack_id: string | null;
  status: GenerationRunStatus;
  plan: GenerationPlan;
  cancel_requested: boolean;
  error: string | null;
  completed_jobs: number;
  total_jobs: number;
  charged_credits: number;
  created_at: string;
  updated_at: string;
  user_tile_packs?: UserTilePack;
  library_tile_packs?: LibraryTilePack;
}

export interface TilePackGenerationJob {
  id: string;
  run_id: string;
  ordinal: number;
  slot_id: string;
  phase: "proof" | "pack";
  job: GenerationJob;
  status: "pending" | "generating" | "generated" | "normalized" | "rejected" | "failed" | "cancelled";
  attempts: unknown[];
  /** Provider calls charged or covered for this slot. First is billed, next
   *  three are free retries; see MAX_GENERATION_ATTEMPTS. */
  generation_attempts: number;
  /** 256px reduction of an accepted proof tile, sent as a style reference for
   *  pack-phase generations. Proof slots only. */
  style_ref_path: string | null;
  raw_path: string | null;
  normalized_path: string | null;
  error: string | null;
}
