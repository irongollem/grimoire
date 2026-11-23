import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { QuestBeat } from "@/types/quest.types";
import type { BeatFillContext } from "@/lib/quests/beatFill";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), mutateAsync: vi.fn() }));
vi.mock("@/ai/useQuestBeatFill", () => ({ useQuestBeatFill: () => ({ generate: mocks.generate, error: ref(null), isGenerating: ref(false) }) }));
vi.mock("@/composables/quests/useQuestFlow", () => ({ useUpdateQuestBeat: () => ({ mutateAsync: mocks.mutateAsync }) }));

const { useFillQuestBeat } = await import("./useFillQuestBeat");

const beat = { id: "b1", quest_id: "q1", title: "Untitled beat", kind: "social", dm_content: null, read_aloud: null,
  how_it_plays: null, what_happened: null, rumor_text: null, reveal_text: null, improv_reviewed_at: null, ai_provenance: null,
  updated_at: "2026-11-23T10:00:00Z" } as unknown as QuestBeat;
const context = { quest: { title: "Q", summary: null } } as BeatFillContext;
const filled = { fill: { title: "The gate", readAloud: "Read", dmContent: "Lead" }, provenance: null };

describe("useFillQuestBeat", () => {
  beforeEach(() => {
    mocks.generate.mockReset().mockResolvedValue(filled);
    mocks.mutateAsync.mockReset().mockImplementation(async (input) => ({ ...beat, id: input.id }));
  });

  it("saves the fill the editor would have applied, locked to the row it read", async () => {
    await useFillQuestBeat().fillBeat({ beat, context, steer: "tense", overwrite: false });
    expect(mocks.generate).toHaveBeenCalledWith("q1", context, "tense");
    const save = mocks.mutateAsync.mock.calls[0][0];
    expect(save).toMatchObject({ id: "b1", questId: "q1", expectedUpdatedAt: "2026-11-23T10:00:00Z" });
    expect(save.update.title).toBe("The gate");
    expect(save.update.read_aloud).toContain("Read");
  });

  it("saves nothing when the generation failed", async () => {
    mocks.generate.mockResolvedValueOnce(null);
    expect(await useFillQuestBeat().fillBeat({ beat, context, steer: "", overwrite: false })).toBeNull();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("lets a failed save throw, so the caller can say the paid fill was lost", async () => {
    mocks.mutateAsync.mockRejectedValueOnce(new Error("changed in another window"));
    await expect(useFillQuestBeat().fillBeat({ beat, context, steer: "", overwrite: false })).rejects.toThrow("changed in another window");
  });
});
