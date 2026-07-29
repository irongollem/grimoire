import { describe, expect, it, vi } from "vitest";
import {
  claimGenerationJob,
  createGenerationJob,
  failGenerationJob,
  persistGenerationArtifact,
  settleGenerationJob,
} from "./aiGenerationJob";

function mutationClient(result: { data?: unknown; error?: unknown } = {}) {
  const query = {
    upsert: vi.fn(() => query),
    update: vi.fn(() => query),
    select: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue({
      data: result.data ?? {
        id: "job-1", user_id: "user-1", campaign_id: "campaign-1", generator_type: "music",
        status: "queued", request_json: {}, artifact_metadata: {}, billing_context: {},
      },
      error: result.error ?? null,
    }),
    eq: vi.fn(() => query),
  };
  return {
    from: vi.fn(() => query),
    rpc: vi.fn().mockResolvedValue({ error: result.error ?? null }),
    query,
  } as never;
}

describe("aiGenerationJob helpers", () => {
  it("creates a queued job with a durable request and safe billing snapshot", async () => {
    const admin = mutationClient();
    const created = await createGenerationJob(admin, {
      user_id: "user-1", campaign_id: "campaign-1", kind: "music", request: { prompt: "tavern" },
      idempotency_key: "request-1", billing: { reservation_ids: ["hold-1"], cost: 2 },
    });
    expect(created.created).toBe(true);
    expect(admin.query.upsert).toHaveBeenCalledWith(expect.objectContaining({
      status: "queued", generator_type: "music", request_json: { prompt: "tavern" },
      billing_context: { reservation_ids: ["hold-1"], cost: 2 },
    }), expect.any(Object));
  });

  it("claims work once and persists the artifact before settlement", async () => {
    const admin = mutationClient();
    await claimGenerationJob(admin, "job-1");
    expect(admin.query.update).toHaveBeenCalledWith(expect.objectContaining({ status: "running" }));
    await persistGenerationArtifact(admin, "job-1", { storage_path: "user/ai/job.mp3" });
    expect(admin.query.update).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "settling", artifact_storage_path: "user/ai/job.mp3",
    }));
  });

  it("uses transactional RPCs for settlement and failure/release", async () => {
    const admin = mutationClient();
    await settleGenerationJob(admin, "job-1", { sound_id: "job-1" });
    await failGenerationJob(admin, "job-2", "provider unavailable");
    expect(admin.rpc).toHaveBeenCalledWith("settle_ai_generation_job", {
      p_job_id: "job-1", p_result_json: { sound_id: "job-1" },
    });
    expect(admin.rpc).toHaveBeenCalledWith("fail_ai_generation_job", {
      p_job_id: "job-2", p_error: "provider unavailable",
    });
  });
});
