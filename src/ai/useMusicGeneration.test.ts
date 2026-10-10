// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  waitForJob: vi.fn(),
  acknowledge: vi.fn(),
  listUnconsumed: vi.fn(),
  invalidateQueries: vi.fn(),
  ui: { addSoundDialogOpen: false },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    // getOrCreateMusicRequestId only reads here when a saved key matches.
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
  },
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

  it("sends an edited prompt as written", async () => {
    mocks.waitForJob.mockResolvedValue(job());
    const music = useMusicGeneration();

    await music.generate({ ...INPUT, prompt: "A defiant duel song for a swashbuckler." });

    expect(mocks.invoke).toHaveBeenCalledWith("generate-music", expect.objectContaining({
      body: expect.objectContaining({ prompt: "A defiant duel song for a swashbuckler." }),
    }));
  });
});
