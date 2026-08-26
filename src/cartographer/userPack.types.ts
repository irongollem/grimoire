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

export interface TilePackGenerationRun {
  id: string;
  user_id: string;
  campaign_id: string;
  tile_pack_id: string;
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
  raw_path: string | null;
  normalized_path: string | null;
  error: string | null;
}
