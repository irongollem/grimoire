import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake, type SupabaseFake } from "@/test/supabaseFake";
import {
  claimGenerationJob,
  createGenerationJob,
  failGenerationJob,
  findGenerationJob,
  persistGenerationArtifact,
  recordGenerationJobMetadata,
} from "./aiGenerationJob";

let fake: SupabaseFake;
const admin = () => fake.client as unknown as SupabaseClient;

const input = {
  user_id: "user-1",
  campaign_id: "campaign-1",
  kind: "music",
  request: { prompt: "tavern" },
  idempotency_key: "request-1",
};

function job(over: Record<string, unknown>) {
  return { id: "job-1", user_id: "user-1", campaign_id: "campaign-1", generator_type: "music", status: "queued", ...over };
}

beforeEach(() => {
  fake = createSupabaseFake();
});

describe("createGenerationJob", () => {
  it("stores a queued job with the request and billing snapshot", async () => {
    const { job: made, created } = await createGenerationJob(admin(), { ...input, billing: { reservation_ids: ["hold-1"], cost: 2 } });
    expect(created).toBe(true);
    expect(made).toMatchObject({ status: "queued", request_json: { prompt: "tavern" }, billing_context: { reservation_ids: ["hold-1"], cost: 2 } });
    expect(fake.rows("ai_generation_jobs")).toHaveLength(1);
  });

  it("returns the original job, not a second one, when the same request is retried", async () => {
    fake.seed("ai_generation_jobs", [job({ idempotency_key: "request-1", status: "running" })]);
    const { job: found, created } = await createGenerationJob(admin(), input);
    expect(created).toBe(false);
    expect(found).toMatchObject({ id: "job-1", status: "running" });
    expect(fake.rows("ai_generation_jobs")).toHaveLength(1);
  });

  it("does not treat another user's job with the same key as a retry", async () => {
    fake.seed("ai_generation_jobs", [job({ id: "theirs", user_id: "user-2", idempotency_key: "request-1" })]);
    const { created } = await createGenerationJob(admin(), input);
    expect(created).toBe(true);
    expect(fake.rows("ai_generation_jobs")).toHaveLength(2);
  });
});

describe("findGenerationJob", () => {
  it("finds only the caller's job of that kind for that key", async () => {
    fake.seed("ai_generation_jobs", [
      job({ id: "theirs", user_id: "user-2", idempotency_key: "k" }),
      job({ id: "other-kind", generator_type: "npc", idempotency_key: "k" }),
      job({ id: "mine", idempotency_key: "k" }),
    ]);
    await expect(findGenerationJob(admin(), "user-1", "music", "k")).resolves.toMatchObject({ id: "mine" });
    await expect(findGenerationJob(admin(), "user-1", "music", "unknown")).resolves.toBeNull();
  });
});

describe("claiming and persisting", () => {
  it("lets one worker claim a queued job and nobody else claim it again", async () => {
    fake.seed("ai_generation_jobs", [job({})]);
    await expect(claimGenerationJob(admin(), "job-1")).resolves.toMatchObject({ id: "job-1", status: "running" });
    await expect(claimGenerationJob(admin(), "job-1")).resolves.toBeNull();
  });

  it("persists an artifact only on a running job, then moves it to settling", async () => {
    fake.seed("ai_generation_jobs", [job({ status: "running" }), job({ id: "job-2", status: "queued" })]);
    await persistGenerationArtifact(admin(), "job-1", { storage_path: "user/ai/job.mp3" });
    expect(fake.rows("ai_generation_jobs").find((j) => j.id === "job-1")).toMatchObject({
      status: "settling",
      artifact_storage_path: "user/ai/job.mp3",
    });
    await expect(persistGenerationArtifact(admin(), "job-2", { storage_path: "x" })).rejects.toThrow(/was not running/);
    expect(fake.rows("ai_generation_jobs").find((j) => j.id === "job-2")).toMatchObject({ status: "queued" });
  });

  it("records metadata on a running job only", async () => {
    fake.seed("ai_generation_jobs", [job({ status: "ready" })]);
    await expect(recordGenerationJobMetadata(admin(), "job-1", { prompt: "p" })).rejects.toThrow(/was not running/);
  });
});

describe("failGenerationJob", () => {
  it("cuts an overlong provider message to 1000 characters before it reaches the database", async () => {
    let sent = "";
    fake.onRpc("fail_ai_generation_job", (args) => {
      sent = String(args.p_error);
    });
    await failGenerationJob(admin(), "job-1", "x".repeat(5000));
    expect(sent).toHaveLength(1000);
  });
});
