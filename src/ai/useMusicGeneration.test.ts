// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  waitForJob: vi.fn(),
  acknowledge: vi.fn(),
  listUnconsumed: vi.fn(),
  invalidateQueries: vi.fn(),
  ui: { addSoundDialogOpen: false },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: Object.assign(fake.client, { functions: { invoke: mocks.invoke } }),
}));

vi.mock("@tanstack/vue-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock("@/stores/ui/soundboard", () => ({
  useSoundboardUiStore: () => mocks.ui,
}));

vi.mock("./useAiGenerationJob", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./useAiGenerationJob")>();
  return {
    ...actual,
    waitForAiGenerationJob: mocks.waitForJob,
    acknowledgeAiGenerationJob: mocks.acknowledge,
    listUnconsumedAiGenerationJobs: mocks.listUnconsumed,
  };
});

import { useMusicGeneration, type MusicGenerationInput } from "./useMusicGeneration";
import { AiGenerationJobFailedError, type AiGenerationJob } from "./useAiGenerationJob";
import { getAiGeneratorRegistry } from "./aiGeneratorRegistry";

function job(overrides: Partial<AiGenerationJob> = {}): AiGenerationJob {
  return {
    id: "job-1",
    status: "ready",
    result_json: { campaign_id: "campaign-1", sound_id: "sound-1" },
    artifacts: { url: "https://cdn.example/a.mp3", storagePath: "u/ai/job-1.mp3", mimeType: "audio/mpeg", metadata: {} },
    error: null,
    consumedAt: null,
    createdAt: "2026-09-28T20:00:00Z",
    completedAt: "2026-09-28T20:01:00Z",
    ...overrides,
  };
}

const INPUT: MusicGenerationInput = {
  campaignId: "campaign-1",
  pageId: null,
  soundName: "Rosie's Defense",
  category: "music",
  request: { description: "Rosie", lengthSeconds: 180, vocals: "vocals", mentions: [], imageCount: 1 },
  imageUrls: ["https://cdn.example/rosie.jpeg"],
  prompt: null,
};

describe("useMusicGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.reset();
    localStorage.clear();
    mocks.ui.addSoundDialogOpen = false;
    mocks.invoke.mockResolvedValue({ data: { job_id: "job-1" }, error: null });
    const music = useMusicGeneration();
    music.resetDraft();
    music.clearError();
    music.clearCompleted();
  });

  it("registers with the badge, and Reopen opens the Add Sound dialog", () => {
    const entry = getAiGeneratorRegistry().find((e) => e.label === "Music");
    expect(entry).toBeDefined();
    entry!.openPanel();
    expect(mocks.ui.addSoundDialogOpen).toBe(true);
  });

  it("applies the finished track, clears the draft and marks it completed for the badge", async () => {
    mocks.waitForJob.mockResolvedValue(job());
    const music = useMusicGeneration();
    music.draft.description.value = "@Rosie";

    const done = await music.generate(INPUT);

    expect(done).toBe(true);
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["sounds", "campaign-1"] });
    expect(mocks.acknowledge).toHaveBeenCalledWith("job-1");
    expect(music.completedEntityId.value).toBe("sound-1");
    expect(music.concept.value).toBe("Rosie's Defense");
    expect(music.draft.description.value).toBe("");
    expect(music.isGenerating.value).toBe(false);
  });

  it("hands a refused prompt back as the editable draft prompt", async () => {
    const refused = job({
      status: "failed",
      error: "Input blocked: The prompt contains sensitive words.",
      artifacts: { url: null, storagePath: null, mimeType: null, metadata: { prompt: "A song about Rosetta Vermeil." } },
    });
    mocks.waitForJob.mockRejectedValue(new AiGenerationJobFailedError(refused));
    const music = useMusicGeneration();

    const done = await music.generate(INPUT);

    expect(done).toBe(false);
    expect(music.error.value).toBe("Input blocked: The prompt contains sensitive words.");
    expect(music.draft.editedPrompt.value).toBe("A song about Rosetta Vermeil.");
    expect(music.draft.category.value).toBe("music");
    expect(music.completedEntityId.value).toBeNull();
  });

  it("leaves the draft prompt alone when the job failed before a prompt existed", async () => {
    mocks.waitForJob.mockRejectedValue(new AiGenerationJobFailedError(
      job({ status: "failed", error: "Could not prepare the music prompt.", artifacts: { url: null, storagePath: null, mimeType: null, metadata: {} } }),
    ));
    const music = useMusicGeneration();

    await music.generate(INPUT);

    expect(music.error.value).toBe("Could not prepare the music prompt.");
    expect(music.draft.editedPrompt.value).toBeNull();
  });

  it("does not start a second generation while one is running", async () => {
    let finish!: (j: AiGenerationJob) => void;
    mocks.waitForJob.mockReturnValue(new Promise<AiGenerationJob>((r) => (finish = r)));
    const music = useMusicGeneration();

    const first = music.generate(INPUT);
    await vi.waitFor(() => expect(mocks.waitForJob).toHaveBeenCalled());
    expect(await music.generate(INPUT)).toBe(false);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    finish(job());
    expect(await first).toBe(true);
  });

  it("reports success without touching the board when another tab already applied the track", async () => {
    mocks.waitForJob.mockResolvedValue(job({ consumedAt: "2026-09-28T20:02:00Z" }));
    const music = useMusicGeneration();

    expect(await music.generate(INPUT)).toBe(true);

    expect(music.completedEntityId.value).toBeNull();
    expect(mocks.acknowledge).not.toHaveBeenCalled();
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
  });

  it("refuses a job that belongs to a different campaign, and applies nothing", async () => {
    mocks.waitForJob.mockResolvedValue(job({ result_json: { campaign_id: "campaign-2", sound_id: "sound-9" } }));
    const music = useMusicGeneration();

    expect(await music.generate(INPUT)).toBe(false);

    expect(music.error.value).toBe("This music job belongs to a different campaign.");
    expect(music.completedEntityId.value).toBeNull();
    expect(mocks.acknowledge).not.toHaveBeenCalled();
  });

  it("fails without waiting when the function returns no job id", async () => {
    mocks.invoke.mockResolvedValue({ data: {}, error: null });
    const music = useMusicGeneration();

    expect(await music.generate(INPUT)).toBe(false);

    expect(music.error.value).toBe("Music generator did not return a job id.");
    expect(mocks.waitForJob).not.toHaveBeenCalled();
  });

  describe("the idempotency key", () => {
    function requestIds(): string[] {
      return mocks.invoke.mock.calls.map(([, options]) => (options as { body: { request_id: string } }).body.request_id);
    }

    it("is reused when the same draft is retried after a failure, so a lost response is not paid for twice", async () => {
      mocks.waitForJob.mockRejectedValue(new Error("network dropped"));
      const music = useMusicGeneration();
      await music.generate(INPUT);
      await music.generate({ ...INPUT, imageUrls: ["https://cdn.example/b.jpeg", "https://cdn.example/a.jpeg"] });
      await music.generate({ ...INPUT, imageUrls: ["https://cdn.example/a.jpeg", "https://cdn.example/b.jpeg"] });

      const [first, second, third] = requestIds();
      // The image order is not part of the draft's identity.
      expect(second).toBeDefined();
      expect(third).toBe(second);
      // INPUT differs from the later two by its images, so it is a different draft.
      expect(first).not.toBe(second);
    });

    describe("when the saved request already has a job", () => {
      // The module's comment: a retry reuses a pending request, but a terminal result must not trap the same
      // form inputs behind an old failed/consumed job forever.
      async function retryAgainstJob(job: Record<string, unknown> | null): Promise<{ first: string; second: string }> {
        mocks.waitForJob.mockRejectedValue(new Error("network dropped"));
        const music = useMusicGeneration();
        await music.generate(INPUT);
        const [first] = requestIds();
        if (job) fake.seed("ai_generation_jobs", [{ generator_type: "music", idempotency_key: first, ...job }]);
        await music.generate(INPUT);
        return { first, second: requestIds()[1] };
      }

      it.each([
        ["failed", { status: "failed", consumed_at: null }],
        ["ready and already consumed", { status: "ready", consumed_at: "2026-09-28T20:02:00Z" }],
      ])("gets a fresh key when the job is %s", async (_label, job) => {
        const { first, second } = await retryAgainstJob(job);
        expect(second).not.toBe(first);
      });

      it.each([
        ["still running", { status: "running", consumed_at: null }],
        ["ready but not yet applied", { status: "ready", consumed_at: null }],
      ])("keeps the key when the job is %s", async (_label, job) => {
        const { first, second } = await retryAgainstJob(job);
        expect(second).toBe(first);
      });

      it("keeps the key when the job cannot be read, since a fresh one could pay twice for a lost response", async () => {
        mocks.waitForJob.mockRejectedValue(new Error("network dropped"));
        const music = useMusicGeneration();
        await music.generate(INPUT);
        fake.failNext("ai_generation_jobs", { message: "connection reset", code: "08006" });
        await music.generate(INPUT);
        const [first, second] = requestIds();
        expect(second).toBe(first);
      });

      it("ignores another generator's job that happens to share the key", async () => {
        const { first, second } = await retryAgainstJob({ generator_type: "image", status: "failed", consumed_at: null });
        expect(second).toBe(first);
      });
    });

    it("is not reused for a different draft", async () => {
      mocks.waitForJob.mockRejectedValue(new Error("network dropped"));
      const music = useMusicGeneration();
      await music.generate(INPUT);
      await music.generate({ ...INPUT, soundName: "Another song" });

      const [first, second] = requestIds();
      expect(second).not.toBe(first);
    });

    it("is forgotten once the track is applied, so the next generation is a new request", async () => {
      mocks.waitForJob.mockResolvedValue(job());
      const music = useMusicGeneration();
      await music.generate(INPUT);
      expect(localStorage.getItem("grimoire_music_request:campaign-1")).toBeNull();

      await music.generate(INPUT);
      const [first, second] = requestIds();
      expect(second).not.toBe(first);
    });
  });

  describe("recoverReadyJobs", () => {
    it("applies only this campaign's finished tracks that carry a sound", async () => {
      mocks.listUnconsumed.mockResolvedValue([
        job({ id: "job-1" }),
        job({ id: "job-2", result_json: { campaign_id: "campaign-2", sound_id: "sound-2" } }),
        job({ id: "job-3", result_json: { campaign_id: "campaign-1", sound_id: "" } }),
      ]);
      const music = useMusicGeneration();

      expect(await music.recoverReadyJobs("campaign-1")).toBe(1);

      expect(mocks.acknowledge).toHaveBeenCalledTimes(1);
      expect(mocks.acknowledge).toHaveBeenCalledWith("job-1");
      expect(music.completedEntityId.value).toBe("sound-1");
    });
  });

  it("sends an edited prompt as written", async () => {
    mocks.waitForJob.mockResolvedValue(job());
    const music = useMusicGeneration();

    await music.generate({ ...INPUT, prompt: "A defiant duel song for a swashbuckler." });

    expect(mocks.invoke).toHaveBeenCalledWith("generate-music", expect.objectContaining({
      body: expect.objectContaining({ prompt: "A defiant duel song for a swashbuckler." }),
    }));
  });
});
