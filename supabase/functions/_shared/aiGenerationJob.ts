/**
 * Durable, provider-agnostic AI generation job helpers.
 *
 * A job owns the recoverable output and the credit reservation that paid for
 * it. Provider credentials never enter this record. Workers claim a job once,
 * persist their artifact, then let the database settle billing and readiness
 * together.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type GenerationJobStatus = "queued" | "running" | "settling" | "ready" | "failed";
export type GenerationJson = Record<string, unknown>;

export interface GenerationArtifacts {
  url?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
  metadata?: GenerationJson;
}

/** Safe-to-store settlement data. Do not put provider credentials here. */
export interface GenerationBillingContext {
  reservation_ids?: string[];
  generation_type?: string;
  cost?: number;
  is_byok?: boolean;
  log?: GenerationJson;
}

export interface GenerationJob {
  id: string;
  user_id: string;
  campaign_id: string;
  generator_type: string;
  status: GenerationJobStatus;
  request_json: GenerationJson;
  artifact_url: string | null;
  artifact_storage_path: string | null;
  artifact_mime_type: string | null;
  artifact_metadata: GenerationJson;
  billing_context: GenerationBillingContext;
}

export interface CreateGenerationJobInput {
  user_id: string;
  campaign_id: string;
  /** Stable domain name such as `music`, `npc`, or `text_enhancement`. */
  kind: string;
  /** Sanitized request snapshot needed to recover or display the draft. */
  request: GenerationJson;
  /** Reservation and accounting metadata only — never API keys or raw secrets. */
  billing?: GenerationBillingContext;
  /** Caller-provided request UUID; retries always return the original job. */
  idempotency_key?: string | null;
  /** Absolute expiry for stale-worker cleanup. Defaults to the DB's 30 minutes. */
  stale_after?: string | null;
}

const JOB_SELECT = [
  "id", "user_id", "campaign_id", "generator_type", "status", "request_json",
  "artifact_url", "artifact_storage_path", "artifact_mime_type", "artifact_metadata", "billing_context",
].join(",");

function asJob(value: unknown): GenerationJob {
  return value as GenerationJob;
}

export async function findGenerationJob(
  admin: SupabaseClient,
  userId: string,
  kind: string,
  idempotencyKey: string,
): Promise<GenerationJob | null> {
  const { data, error } = await admin
    .from("ai_generation_jobs")
    .select(JOB_SELECT)
    .eq("user_id", userId)
    .eq("generator_type", kind)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw new Error(`findGenerationJob failed: ${error.message}`);
  return data ? asJob(data) : null;
}

/** Create a durable job. The `created` flag prevents duplicate requests launching a second worker. */
export async function createGenerationJob(
  admin: SupabaseClient,
  input: CreateGenerationJobInput,
): Promise<{ job: GenerationJob; created: boolean }> {
  const row = {
    user_id: input.user_id,
    campaign_id: input.campaign_id,
    generator_type: input.kind,
    request_json: input.request,
    billing_context: input.billing ?? {},
    idempotency_key: input.idempotency_key ?? null,
    stale_after: input.stale_after ?? undefined,
    status: "queued" as const,
  };

  const { data, error } = await admin
    .from("ai_generation_jobs")
    .upsert(row, { onConflict: "user_id,generator_type,idempotency_key", ignoreDuplicates: true })
    .select(JOB_SELECT)
    .maybeSingle();
  if (error) throw new Error(`createGenerationJob failed: ${error.message}`);
  if (data) return { job: asJob(data), created: true };

  if (input.idempotency_key) {
    const job = await findGenerationJob(admin, input.user_id, input.kind, input.idempotency_key);
    if (job) return { job, created: false };
  }
  throw new Error("createGenerationJob failed: job row was not returned");
}

/** Atomically claim queued work. A null return means another worker already owns it. */
export async function claimGenerationJob(
  admin: SupabaseClient,
  jobId: string,
): Promise<GenerationJob | null> {
  const { data, error } = await admin
    .from("ai_generation_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "queued")
    .select(JOB_SELECT)
    .maybeSingle();
  if (error) throw new Error(`claimGenerationJob failed: ${error.message}`);
  return data ? asJob(data) : null;
}

/** Persist an uploaded artifact before dependent application entities are created. */
export async function persistGenerationArtifact(
  admin: SupabaseClient,
  jobId: string,
  artifacts: GenerationArtifacts,
): Promise<void> {
  const { data, error } = await admin
    .from("ai_generation_jobs")
    .update({
      status: "settling",
      artifact_url: artifacts.url ?? null,
      artifact_storage_path: artifacts.storage_path ?? null,
      artifact_mime_type: artifacts.mime_type ?? null,
      artifact_metadata: artifacts.metadata ?? {},
      error: null,
    })
    .eq("id", jobId)
    .eq("status", "running")
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error(`persistGenerationArtifact failed: ${error?.message ?? "job was not running"}`);
}

/** Settles the reservation, records the real spend, and exposes the ready result in one DB transaction. */
export async function settleGenerationJob(
  admin: SupabaseClient,
  jobId: string,
  result: GenerationJson,
): Promise<void> {
  const { error } = await admin.rpc("settle_ai_generation_job", {
    p_job_id: jobId,
    p_result_json: result,
  });
  if (error) throw new Error(`settleGenerationJob failed: ${error.message}`);
}

/** Atomically creates the idempotent sound row and settles a persisted music artifact. */
export async function finalizeMusicGenerationJob(
  admin: SupabaseClient,
  jobId: string,
): Promise<void> {
  const { error } = await admin.rpc("finalize_music_generation_job", { p_job_id: jobId });
  if (error) throw new Error(`finalizeMusicGenerationJob failed: ${error.message}`);
}

/** Fails an active job and releases any durable reservation in the same transaction. */
export async function failGenerationJob(
  admin: SupabaseClient,
  jobId: string,
  message: string,
): Promise<void> {
  const { error } = await admin.rpc("fail_ai_generation_job", {
    p_job_id: jobId,
    p_error: message.slice(0, 1_000),
  });
  if (error) throw new Error(`failGenerationJob failed: ${error.message}`);
}
