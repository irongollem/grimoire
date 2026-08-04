/**
 * Async image-generation job helpers.
 *
 * Edge functions kick off OpenAI image calls in the background via
 * EdgeRuntime.waitUntil(), so they can return a job id immediately without
 * holding the gateway connection (the gateway times out at ~150s, but
 * gpt-image edit calls can take 1-3 minutes). The client polls/subscribes
 * to the job row for completion.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveNotePendingImage } from "./notePendingImage.ts";

export type ImageJobKind =
  | "chronicler"
  | "group_portrait"
  | "npc_portrait"
  | "monster"
  | "item"
  | "spell"
  | "faction"
  | "location"
  | "mini_style"
  | "npc_disguise"
  | "location_map"
  | "trap"
  | "puzzle"
  | "party_member"
  | "species"
  | "map_style";

// Allowlist of (table:column) pairs the async completion step may write to.
// completeImageJob performs a DYNAMIC `.from(target_table).update({[target_column]})`
// with the service-role client (RLS bypassed); without this gate a job row with
// attacker-chosen target_* would be an arbitrary-table/column write. Add a
// pair here when wiring a new target. `notes:content` is deliberately NOT
// in this set: it is special-cased to an anchor rewrite below — a raw column
// overwrite would replace the whole note body with a bare URL.
const ALLOWED_IMAGE_TARGETS = new Set<string>([
  "npcs:portrait_url",
  "monsters:image_url",
  "items:image_url",
  "spells:image_url",
  "factions:image_url",
  "locations:image_url",
  "party_members:group_portrait_url",
  "minis:stylized_image_url",
]);

export interface CreateJobInput {
  user_id: string;
  campaign_id: string;
  kind: ImageJobKind;
  prompt: string;
  size: string;
  model: string;
  provider: string;
  target_table?: string | null;
  target_id?: string | null;
  target_column?: string | null;
}

export async function createImageJob(
  admin: SupabaseClient,
  input: CreateJobInput,
): Promise<string> {
  const { data, error } = await admin
    .from("image_generation_jobs")
    .insert({
      user_id: input.user_id,
      campaign_id: input.campaign_id,
      kind: input.kind,
      prompt: input.prompt,
      size: input.size,
      model: input.model,
      provider: input.provider,
      target_table: input.target_table ?? null,
      target_id: input.target_id ?? null,
      target_column: input.target_column ?? null,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`createImageJob failed: ${error?.message}`);
  return (data as { id: string }).id;
}

/**
 * Mark a job ready, write the image URL, and (if target_* is set) update
 * the target entity row's image column in the same step.
 */
export async function completeImageJob(
  admin: SupabaseClient,
  jobId: string,
  imageUrl: string,
): Promise<void> {
  const { data: job, error: fetchErr } = await admin
    .from("image_generation_jobs")
    .select("user_id, target_table, target_id, target_column")
    .eq("id", jobId)
    .maybeSingle();
  if (fetchErr || !job) {
    throw new Error(`completeImageJob fetch failed: ${fetchErr?.message ?? "job not found"}`);
  }

  const { data: completed, error } = await admin
    .from("image_generation_jobs")
    .update({
      status: "ready",
      image_url: imageUrl,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error || !completed) {
    throw new Error(`completeImageJob failed: ${error?.message ?? "job was not pending"}`);
  }

  const j = job as { user_id: string; target_table: string | null; target_id: string | null; target_column: string | null } | null;
  if (j?.target_table && j.target_id && j.target_column) {
    // Chronicle jobs target the owning note's Tiptap content: swap the
    // job's pendingImage anchor for the image node (#614) instead of the
    // generic column write. Best-effort by design — the job is already
    // ready and the image persisted, so a lost race or deleted anchor
    // must not flip the job to failed (throwing here would, via
    // runGeneration's catch → failImageJob).
    if (j.target_table === "notes" && j.target_column === "content") {
      await resolveNotePendingImage(admin, {
        noteId: j.target_id,
        userId: j.user_id,
        jobId,
        imageUrl,
      });
      return;
    }
    if (!ALLOWED_IMAGE_TARGETS.has(`${j.target_table}:${j.target_column}`)) {
      throw new Error(`completeImageJob rejected target ${j.target_table}.${j.target_column}`);
    }
    const { data: target, error: targetErr } = await admin
      .from(j.target_table)
      .update({ [j.target_column]: imageUrl })
      .eq("id", j.target_id)
      .select("id")
      .maybeSingle();
    if (targetErr || !target) {
      throw new Error(`completeImageJob target update failed: ${targetErr?.message ?? "target not found"}`);
    }
  }
}

export async function failImageJob(
  admin: SupabaseClient,
  jobId: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await admin
    .from("image_generation_jobs")
    .update({
      status: "failed",
      error: errorMessage.slice(0, 1000),
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) console.error(`failImageJob update failed (${jobId}):`, error);
}
