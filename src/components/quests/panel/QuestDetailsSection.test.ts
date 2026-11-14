import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QuestDetailsSection from "./QuestDetailsSection.vue";
import { QUEST_SUMMARY_MAX } from "@/lib/quests/summary";
import type { Quest } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  updateQuest: vi.fn(),
  npcs: [] as Array<{ id: string; name: string }>,
  locations: [] as Array<{ id: string; name: string }>,
  allQuests: [] as Array<{ id: string; title: string }>,
}));

vi.mock("@/composables/npcs/useNpcs", () => ({
  useNpcs: (enabled?: () => boolean) => ({ data: { value: enabled?.() ? mocks.npcs : undefined } }),
  useNpc: (id: { value: string }) => ({ data: { value: mocks.npcs.find((n) => n.id === id.value) } }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useAllLocations: (enabled?: () => boolean) => ({ data: { value: enabled?.() ? mocks.locations : undefined } }),
  useLocation: (id: () => string | null) => ({ data: { value: mocks.locations.find((l) => l.id === id()) } }),
}));
vi.mock("@/composables/quests/useQuests", () => ({
  useQuests: () => ({ data: { value: mocks.allQuests } }),
  useUpdateQuest: () => ({ mutateAsync: mocks.updateQuest }),
}));

function quest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: "quest-1",
    user_id: "u1",
    campaign_id: "campaign-1",
    parent_quest_id: null,
    title: "The Unseen",
    summary: "A rumor of something wrong at the mill.",
    dm_content: null,
    status: "active",
    giver_npc_id: null,
    location_id: null,
    tags: ["mill"],
    player_visible_to: [],
    started_at: null,
    resolved_at: null,
    entry_beat_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function mountDetails(overrides: Partial<Quest> = {}) {
  return mount(QuestDetailsSection, {
    props: { quest: quest(overrides) },
    global: { stubs: { EntityCombobox: true } },
  });
}

describe("QuestDetailsSection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.updateQuest.mockReset();
    mocks.updateQuest.mockResolvedValue(undefined);
    mocks.npcs = [];
    mocks.locations = [];
    mocks.allQuests = [];
  });
  afterEach(() => vi.useRealTimers());

  // Fields autosave through useAutosave: an edit waits out the 2s debounce.
  async function settle() {
    await vi.advanceTimersByTimeAsync(2100);
    await flushPromises();
  }

  const box = (w: ReturnType<typeof mountDetails>, placeholder: string) =>
    w.findAllComponents({ name: "EntityCombobox" }).find((c) => c.props("placeholder") === placeholder)!;

  // Fails on an "Opens at" or a sharing field creeping back into the
  // panel: the entry is set on a beat, and sharing is the Players section's own write.
  it("shows the quest-level details only: no opening beat, no sharing", () => {
    const fields = mountDetails().findAll("span.text-caption").map((span) => span.text());
    expect(fields).toEqual(["Board lane", "Giver", "Location", "Part of", "Tags"]);
    expect(mountDetails().findAll("input")[0]!.attributes("aria-label")).toBe("Title");
    expect(mountDetails().find('input[aria-label="Premise"]').attributes("aria-label")).toBe("Premise");
  });

  it("caps the premise input at QUEST_SUMMARY_MAX, since players see it verbatim", () => {
    const summaryInput = mountDetails().find('input[aria-label="Premise"]');
    expect(summaryInput.attributes("maxlength")).toBe(String(QUEST_SUMMARY_MAX));
    expect(summaryInput.attributes("placeholder")).toContain("players see this");
  });

  it("saves the premise trimmed, or null when cleared", async () => {
    const wrapper = mountDetails({ summary: "Something." });
    await wrapper.find('input[aria-label="Premise"]').setValue("   ");
    expect(mocks.updateQuest).not.toHaveBeenCalled();
    await settle();
    expect(mocks.updateQuest).toHaveBeenCalledWith({ id: "quest-1", update: { summary: null } });
  });

  // The run cockpit also writes `status`; a details save must not put a stale lane back.
  it("sends only what changed here: an untouched status stays out of the write, and follows the server", async () => {
    const wrapper = mountDetails({ status: "active" });
    await wrapper.setProps({ quest: quest({ status: "completed" }) });
    await wrapper.find('input[aria-label="Premise"]').setValue("A new premise");
    await settle();
    expect(mocks.updateQuest).toHaveBeenCalledOnce();
    expect(mocks.updateQuest.mock.calls[0]![0].update).toEqual({ summary: "A new premise" });
  });

  it("a cleared quest giver is saved as no giver, not as an empty id", async () => {
    mocks.npcs = [{ id: "npc-1", name: "Oarus" }];
    const wrapper = mountDetails({ giver_npc_id: "npc-1" });
    box(wrapper, "Search NPCs…").vm.$emit("update:modelValue", "");
    await settle();
    expect(mocks.updateQuest.mock.calls[0]![0].update).toEqual({ giver_npc_id: null });
  });

  it("a quest cannot be made part of itself", () => {
    mocks.allQuests = [{ id: "quest-1", title: "The Unseen" }, { id: "quest-2", title: "" }];
    expect(box(mountDetails(), "Search quests…").props("options")).toEqual([{ id: "quest-2", name: "Untitled Quest" }]);
  });

  it("opening another quest saves the pending edit to the quest it was made on, at once", async () => {
    const wrapper = mountDetails();
    await wrapper.find('input[aria-label="Premise"]').setValue("Edited premise");
    await wrapper.setProps({ quest: quest({ id: "quest-2", summary: "Another" }) });
    await flushPromises();
    expect(mocks.updateQuest).toHaveBeenCalledTimes(1);
    expect(mocks.updateQuest).toHaveBeenCalledWith({ id: "quest-1", update: { summary: "Edited premise" } });
  });

  // Fails if the quest title cannot be edited from the panel, now that the header only shows it.
  it("saves an edited title, trimmed", async () => {
    const wrapper = mountDetails();
    await wrapper.find('input[aria-label="Title"]').setValue("  The Seen  ");
    await settle();
    expect(mocks.updateQuest).toHaveBeenCalledWith({ id: "quest-1", update: { title: "The Seen" } });
  });

  // Fails if clearing the field writes an empty title over the quest's name.
  it("never saves an empty title: the last saved one stays", async () => {
    const wrapper = mountDetails();
    await wrapper.find('input[aria-label="Title"]').setValue("   ");
    await settle();
    expect(mocks.updateQuest).not.toHaveBeenCalled();
  });
});
