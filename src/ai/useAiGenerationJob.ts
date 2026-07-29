import { supabase } from "@/lib/supabase";
import { waitForRow } from "./waitForRow";

export type AiGenerationJobStatus = "queued" | "running" | "settling" | "ready" | "failed";

export interface AiGenerationJobArtifacts {
  url: string | null;
  storagePath: string | null;
  mimeType: string | null;
  metadata: Record<string, unknown>;
}

export interface AiGenerationJob<Result = unknown> {
  id: string;
  status: AiGenerationJobStatus;
  result_json: Result | null;
  artifacts: AiGenerationJobArtifacts;
  error: string | null;
  consumedAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface AiGenerationJobRow<Result = unknown> {
  id: string;
  status: AiGenerationJobStatus;
  result_json: Result | null;
  artifact_url: string | null;
  artifact_storage_path: string | null;
  artifact_mime_type: string | null;
  artifact_metadata: Record<string, unknown> | null;
  error: string | null;
  consumed_at: string | null;
  created_at: string;
  completed_at: string | null;
}

function toJob<Result>(row: AiGenerationJobRow<Result>): AiGenerationJob<Result> {
  return {
    id: row.id,
    status: row.status,
    result_json: row.result_json,
    artifacts: {
      url: row.artifact_url,
      storagePath: row.artifact_storage_path,
      mimeType: row.artifact_mime_type,
      metadata: row.artifact_metadata ?? {},
    },
    error: row.error,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

const JOB_SELECT = [
  "id",
  "status",
  "result_json",
  "artifact_url",
  "artifact_storage_path",
  "artifact_mime_type",
  "artifact_metadata",
  "error",
  "consumed_at",
  "created_at",
  "completed_at",
].join(", ");

/**
 * Wait for a server-created AI generation to settle. Realtime delivers the
 * normal completion path; `waitForRow` performs the initial and missed-event
 * HTTP checks. It never marks the draft consumed.
 */
export async function waitForAiGenerationJob<Result = unknown>(
  jobId: string,
  opts: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<AiGenerationJob<Result>> {
  const row = await waitForRow<AiGenerationJobRow<Result>>({
    table: "ai_generation_jobs",
    id: jobId,
    select: JOB_SELECT,
    resolveWhen: (candidate) => candidate.status === "ready",
    rejectWhen: (candidate) => candidate.status === "failed"
      ? (candidate.error ?? "AI generation failed.")
      : null,
    timeoutMs: opts.timeoutMs ?? 35 * 60 * 1_000,
    timeoutMessage: "This generation is taking longer than expected. It remains safely saved and may still finish shortly.",
    pollIntervalMs: opts.pollIntervalMs,
  });
  return toJob(row);
}

/** Mark a ready draft as applied without granting the client broad job writes. */
export async function acknowledgeAiGenerationJob(jobId: string): Promise<void> {
  const { error } = await supabase.rpc("acknowledge_ai_generation_job", { p_job_id: jobId });
  if (error) throw new Error(`Could not acknowledge AI generation: ${error.message}`);
}

/**
 * Recover finished drafts from the durable owner-visible job table. This is
 * intentionally independent of localStorage so a completed generation can be
 * picked up after navigation, a refreshed tab, or a different device.
 */
export async function listUnconsumedAiGenerationJobs<Result = unknown>(opts: {
  campaignId: string;
  generatorType: string;
}): Promise<AiGenerationJob<Result>[]> {
  const { data, error } = await supabase
    .from("ai_generation_jobs")
    .select(JOB_SELECT)
    .eq("campaign_id", opts.campaignId)
    .eq("generator_type", opts.generatorType)
    .eq("status", "ready")
    .is("consumed_at", null)
    .order("completed_at", { ascending: true });
  if (error) throw new Error(`Could not recover AI generations: ${error.message}`);
  return ((data ?? []) as unknown as AiGenerationJobRow<Result>[]).map(toJob);
}
