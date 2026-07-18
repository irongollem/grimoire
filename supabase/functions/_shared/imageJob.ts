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

export type ImageJobKind =
  | "chronicler"
  | "group_portrait"
  | "npc_portrait"
  | "monster"
  | "item"
  | "spell"
  | "faction"
  | "location"
  | "mini_style";

// Allowlist of (table:column) pairs the async completion step may write to.
// completeImageJob performs a DYNAMIC `.from(target_table).update({[target_column]})`
// with the service-role client (RLS bypassed); without this gate a job row with
// attacker-chosen target_* would be an arbitrary-table/column write. No caller
// currently sets target_*; add a pair here when wiring a new target.
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
    .select("target_table, target_id, target_column")
    .eq("id", jobId)
    .maybeSingle();
  if (fetchErr) console.error("completeImageJob fetch failed:", fetchErr);

  const { error } = await admin
    .from("image_generation_jobs")
    .update({
      status: "ready",
      image_url: imageUrl,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) console.error(`completeImageJob update failed (${jobId}):`, error);

  const j = job as { target_table: string | null; target_id: string | null; target_column: string | null } | null;
  if (j?.target_table && j.target_id && j.target_column) {
    if (!ALLOWED_IMAGE_TARGETS.has(`${j.target_table}:${j.target_column}`)) {
      console.error(`completeImageJob: rejected disallowed target ${j.target_table}.${j.target_column}`);
      return;
    }
    const { error: targetErr } = await admin
      .from(j.target_table)
      .update({ [j.target_column]: imageUrl })
      .eq("id", j.target_id);
    if (targetErr) {
      console.error(`completeImageJob target update failed (${j.target_table}.${j.target_id}):`, targetErr);
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
