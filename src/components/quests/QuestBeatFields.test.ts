import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestBeat } from "@/types/quest.types";
import QuestBeatFields from "./QuestBeatFields.vue";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock("@/composables/quests/useQuestFlow", () => ({
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
    await vi.advanceTimersByTimeAsync(2100);

    expect(mocks.update).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Give this beat a title before it is saved.");
    expect(title.attributes("aria-invalid")).toBe("true");

    await title.setValue("  A better bargain  ");
    await vi.advanceTimersByTimeAsync(2100);
    await flushPromises();

    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      id: "beat-1",
      update: expect.objectContaining({ title: "A better bargain" }),
    }));
    expect(wrapper.text()).not.toContain("Give this beat a title before it is saved.");
  });

  // The save path trims and defaults on the way out. It used to adopt that
  // normalised row back into the live draft, which deleted the space off the end
  // of the word being typed every time an autosave landed mid-sentence.
  it("leaves the typed text alone when the save normalises it", async () => {
    const wrapper = mount(QuestBeatFields, {
      props: { beat: beat(), compact: true },
      global: { stubs: { RichTextEditor: true, MentionTextarea: true } },
    });
    const title = wrapper.findAll("input")[0]!;
    await title.setValue("The bandits are ");
    await vi.advanceTimersByTimeAsync(2100);
    await flushPromises();

    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ title: "The bandits are" }),
    }));
    expect((title.element as HTMLInputElement).value).toBe("The bandits are ");
    expect(wrapper.text()).toContain("Saved");
  });

  // The composer creates beats from a fixed list of kinds; this editor used to
  // offer free text, so the same field had two vocabularies.
  it("offers the shared kind list without discarding a kind it does not know", () => {
    const shared = mount(QuestBeatFields, {
      props: { beat: beat(), compact: true },
      global: { stubs: { RichTextEditor: true, MentionTextarea: true } },
    });
    const kind = shared.findAll("select")[0]!;
    expect(kind.findAll("option").map((option) => option.attributes("value")))
      .toEqual(["neutral", "combat", "social", "explore", "discovery"]);
    expect((kind.element as HTMLSelectElement).value).toBe("social");

    const imported = mount(QuestBeatFields, {
      props: { beat: { ...beat(), kind: "heist" }, compact: true },
      global: { stubs: { RichTextEditor: true, MentionTextarea: true } },
    });
    const importedKind = imported.findAll("select")[0]!;
    expect(importedKind.findAll("option").map((option) => option.attributes("value"))).toContain("heist");
    expect((importedKind.element as HTMLSelectElement).value).toBe("heist");
  });

  it("ignores its own saved row echoing back through the beat prop", async () => {
    const wrapper = mount(QuestBeatFields, {
      props: { beat: beat(), compact: true },
      global: { stubs: { RichTextEditor: true, MentionTextarea: true } },
    });
    const title = wrapper.findAll("input")[0]!;
    await title.setValue("The bandits are ");
    await vi.advanceTimersByTimeAsync(2100);
    await flushPromises();

    // What `onSettled`'s refetch delivers: the trimmed row, at the version we
    // already hold. Re-hydrating from it would undo the character just typed.
    await wrapper.setProps({ beat: { ...beat(), title: "The bandits are", updated_at: "version-2" } });
    expect((title.element as HTMLInputElement).value).toBe("The bandits are ");

    // A genuinely newer row from another window still wins.
    await wrapper.setProps({ beat: { ...beat(), title: "Renamed elsewhere", updated_at: "version-3" } });
    expect((title.element as HTMLInputElement).value).toBe("Renamed elsewhere");
  });
});
