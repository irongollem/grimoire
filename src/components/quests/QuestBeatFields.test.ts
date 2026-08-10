import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestBeat } from "@/types/quest.types";
import QuestBeatFields from "./QuestBeatFields.vue";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock("@/composables/useQuestFlow", () => ({
  useUpdateQuestBeat: () => ({ mutateAsync: mocks.update }),
}));

const beat = (): QuestBeat => ({
  id: "beat-1", quest_id: "quest-1", campaign_id: "campaign-1", title: "The bargain",
  dm_content: null, read_aloud: null, how_it_plays: null, outcomes: null, consequences: null,
  rumor_text: null, reveal_text: null, visibility: "hidden", kind: "social",
  presentation_hint: null, canvas_x: 0, canvas_y: 0, is_improvised: false, is_overview: false,
  improv_reviewed_at: null, created_by: "dm", created_at: "now", updated_at: "version-1",
});

describe("QuestBeatFields", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.update.mockReset();
    mocks.update.mockImplementation(async (input: { update: Partial<QuestBeat> }) => ({
      ...beat(), ...input.update, updated_at: "version-2",
    }));
  });
  afterEach(() => vi.useRealTimers());

  it("keeps a blank title local and resumes autosave with the pending draft", async () => {
    const wrapper = mount(QuestBeatFields, {
      props: { beat: beat(), compact: true },
      global: { stubs: { RichTextEditor: true, MentionTextarea: true } },
    });
    const title = wrapper.findAll("input")[0]!;
    await title.setValue("   ");
    await vi.advanceTimersByTimeAsync(900);

    expect(mocks.update).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Give this beat a title before it is saved.");
    expect(title.attributes("aria-invalid")).toBe("true");

    await title.setValue("  A better bargain  ");
    await vi.advanceTimersByTimeAsync(900);
    await flushPromises();

    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      id: "beat-1",
      update: expect.objectContaining({ title: "A better bargain" }),
    }));
    expect(wrapper.text()).not.toContain("Give this beat a title before it is saved.");
  });
});
