import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestBeat } from "@/types/quest.types";
import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import type { BeatFillContext } from "@/lib/quests/beatFill";
import QuestBeatFields from "./QuestBeatFields.vue";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock("@/composables/quests/useQuestFlow", () => ({
  useUpdateQuestBeat: () => ({ mutateAsync: mocks.update }),
}));

// QuestBeatFields now passes @mention items to its RichTextEditors (epic
// #932, story 3); mocked at this boundary rather than pulling in the five
// composables useEntityMentionItems fans out to (party/npcs/monsters/
// locations/factions), none of which this file otherwise sets up.
vi.mock("@/composables/notes/useEntityMentionItems", () => ({
  useEntityMentionItems: () => ({ mentionItems: [] }),
}));

const stubs = { RichTextEditor: true, MentionTextarea: true };

const beat = (): QuestBeat => ({
  id: "beat-1", quest_id: "quest-1", campaign_id: "campaign-1", title: "The bargain",
  dm_content: null, read_aloud: null, how_it_plays: null, converge_mode: "any",
  rumor_text: null, reveal_text: null, visibility: "hidden", kind: "social",
  presentation_hint: null, staged_at_location_id: null, canvas_x: 0, canvas_y: 0, is_improvised: false,
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
      props: { beat: beat() },
      global: { stubs },
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
  it("offers the DM-only block on the rumour and reveal editors only, and saves an emptied rumour editor as null (#1115)", async () => {
    const withRumor: QuestBeat = { ...beat(), rumor_text: toTiptapJson("They say the bell rings.") };
    const wrapper = mount(QuestBeatFields, { props: { beat: withRumor }, global: { stubs } });
    const editors = wrapper.findAllComponents({ name: "RichTextEditor" });
    expect(editors.map((e) => e.props("allowSecrets") === true)).toEqual([false, false, false, true, true]);

    editors[3]!.vm.$emit("update:modelValue", '{"type":"doc","content":[{"type":"paragraph"}]}');
    await vi.advanceTimersByTimeAsync(2100);
    await flushPromises();

    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ rumor_text: null }),
    }));
  });

  it("leaves the typed text alone when the save normalises it", async () => {
    const wrapper = mount(QuestBeatFields, {
      props: { beat: beat() },
      global: { stubs },
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

  it("ignores its own saved row echoing back through the beat prop", async () => {
    const wrapper = mount(QuestBeatFields, {
      props: { beat: beat() },
      global: { stubs },
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

  // Kind, visibility and staged location moved to the Beat panel's own inline
  // rows on the beat page — each saved immediately there, not through this
  // draft — so this editor no longer renders or autosaves them at all.
  it("no longer offers kind, visibility or staged-location controls", () => {
    const wrapper = mount(QuestBeatFields, { props: { beat: beat() }, global: { stubs } });
    expect(wrapper.find("select").exists()).toBe(false);
    expect(wrapper.findComponent({ name: "EntityCombobox" }).exists()).toBe(false);
  });

  it("shows no title warning on an untouched beat that has no title yet", () => {
    const wrapper = mount(QuestBeatFields, { props: { beat: { ...beat(), title: "" } }, global: { stubs } });
    expect(wrapper.text()).not.toContain("Give this beat a title before it is saved.");
  });

  it("opening another beat replaces unsaved typing instead of carrying it over", async () => {
    const wrapper = mount(QuestBeatFields, { props: { beat: beat() }, global: { stubs } });
    const title = wrapper.findAll("input")[0]!;
    await title.setValue("Half-typed");
    await wrapper.setProps({ beat: { ...beat(), id: "beat-2", title: "A different beat", updated_at: "other-1" } });
    expect((title.element as HTMLInputElement).value).toBe("A different beat");
  });

  it("each save carries the version the previous save returned, so a stale window is refused", async () => {
    const wrapper = mount(QuestBeatFields, { props: { beat: beat() }, global: { stubs } });
    const title = wrapper.findAll("input")[0]!;
    await title.setValue("First");
    await vi.advanceTimersByTimeAsync(2100);
    await flushPromises();
    await title.setValue("Second");
    await vi.advanceTimersByTimeAsync(2100);
    await flushPromises();
    expect(mocks.update.mock.calls.map((call) => call[0].expectedUpdatedAt)).toEqual(["version-1", "version-2"]);
  });

  describe("AI fill", () => {
    const fillContext = { quest: { title: "Q", summary: null }, beat: { kind: "social", title: "x", dm_content: null }, incoming: [], outgoing: [], objectives: [] } as unknown as BeatFillContext;
    const filled = { fill: { title: "Filled title", readAloud: "Filled read-aloud", dmContent: "Filled DM lead" }, provenance: null };
    const mountFill = (over: Partial<QuestBeat> = {}) =>
      mount(QuestBeatFields, { props: { beat: { ...beat(), ...over }, fillContext }, global: { stubs: { ...stubs, QuestBeatFillBar: true } } });
    const bar = (w: ReturnType<typeof mountFill>) => w.findComponent({ name: "QuestBeatFillBar" });
    const lastUpdate = async () => {
      await vi.advanceTimersByTimeAsync(2100);
      await flushPromises();
      return mocks.update.mock.calls.at(-1)![0].update as Partial<QuestBeat>;
    };

    it.each([["Untitled beat"], ["new beat"], ["   "]])("replaces the placeholder title %j", async (placeholder) => {
      const wrapper = mountFill({ title: placeholder });
      bar(wrapper).vm.$emit("filled", { ...filled, overwrite: false });
      expect((await lastUpdate()).title).toBe("Filled title");
    });

    it("keeps a title the DM chose", async () => {
      const wrapper = mountFill({ title: "The bargain" });
      bar(wrapper).vm.$emit("filled", { ...filled, overwrite: false });
      expect((await lastUpdate()).title).toBe("The bargain");
    });

    it("fills empty read-aloud and DM lead, and keeps written ones unless the DM asked to overwrite", async () => {
      // The placeholder title is filled, so the fill changes the draft and a save follows.
      const written = { title: "Untitled beat", read_aloud: toTiptapJson("Mine, read aloud"), dm_content: toTiptapJson("Mine, DM lead") };
      const kept = mountFill(written);
      bar(kept).vm.$emit("filled", { ...filled, overwrite: false });
      const keptUpdate = await lastUpdate();
      expect(keptUpdate.read_aloud).toBe(written.read_aloud);
      expect(keptUpdate.dm_content).toBe(written.dm_content);

      mocks.update.mockClear();
      const overwritten = mountFill(written);
      bar(overwritten).vm.$emit("filled", { ...filled, overwrite: true });
      const overwrittenUpdate = await lastUpdate();
      expect(overwrittenUpdate.read_aloud).toBe(toTiptapJson("Filled read-aloud"));
      expect(overwrittenUpdate.dm_content).toBe(toTiptapJson("Filled DM lead"));

      mocks.update.mockClear();
      const empty = mountFill({});
      bar(empty).vm.$emit("filled", { ...filled, overwrite: false });
      expect((await lastUpdate()).read_aloud).toBe(toTiptapJson("Filled read-aloud"));
    });

    it("offers the fill when either the DM lead or the read-aloud has text", () => {
      expect(bar(mountFill({})).props("hasText")).toBe(false);
      expect(bar(mountFill({ dm_content: toTiptapJson("Something") })).props("hasText")).toBe(true);
      expect(bar(mountFill({ read_aloud: toTiptapJson("Something") })).props("hasText")).toBe(true);
    });
  });
});
