import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestOverviewMetadata from "./QuestOverviewMetadata.vue";
import { QUEST_SUMMARY_MAX } from "@/lib/quests/summary";
import type { Quest } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  updateQuest: vi.fn(),
  announce: vi.fn(),
  npcs: [] as Array<{ id: string; name: string }>,
  locations: [] as Array<{ id: string; name: string }>,
  allQuests: [] as Array<{ id: string; title: string }>,
  beats: [] as Array<{ id: string; title: string }>,
  activeCampaignId: "campaign-1" as string | null,
}));

vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: { value: mocks.npcs } }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: { value: mocks.locations } }) }));
vi.mock("@/composables/quests/useQuestFlow", () => ({ useQuestBeats: () => ({ data: { value: mocks.beats } }) }));
vi.mock("@/composables/quests/useQuests", () => ({
  useAllQuests: () => ({ data: { value: mocks.allQuests } }),
  useUpdateQuest: () => ({ mutateAsync: mocks.updateQuest }),
}));
vi.mock("@/composables/campaign/useCampaignBroadcast", () => ({ sendCampaignAnnouncement: mocks.announce }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: mocks.activeCampaignId }) }));

function quest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: "quest-1",
    user_id: "u1",
    campaign_id: "campaign-1",
    parent_quest_id: null,
    title: "The Unseen",
    summary: "A rumor of something wrong at the mill.",
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

function mountMetadata(overrides: Partial<Quest> = {}) {
  return mount(QuestOverviewMetadata, {
    props: { quest: quest(overrides) },
    global: { stubs: { EntityCombobox: true, AudienceRevealControl: true } },
  });
}

describe("QuestOverviewMetadata", () => {
  beforeEach(() => {
    mocks.updateQuest.mockReset();
    mocks.updateQuest.mockResolvedValue(undefined);
    mocks.announce.mockReset();
    mocks.npcs = [];
    mocks.locations = [];
    mocks.allQuests = [];
    mocks.beats = [];
    mocks.activeCampaignId = "campaign-1";
  });

  // The v3 design keeps exactly quest-level identity here: title, premise,
  // status, sharing, giver, location, parent and tags — the story itself
  // lives in beats now. Naming every field is the regression guard: an
  // addition here (a description box, a notes field, a reward line — all
  // deleted or beat-owned this epic) fails this list until someone decides
  // on purpose that it belongs.
  it("shows quest-level identity fields only, nothing a beat owns", () => {
    const wrapper = mountMetadata();
    const fields = wrapper.findAll("span.text-label").map((span) => span.text());
    expect(fields).toEqual([
      "Title",
      "Premise",
      "Board lane",
      "Player sharing",
      "Quest giver",
      "Primary location",
      "Part of quest",
      "Opens at",
      "Tags",
    ]);
  });

  it("syncs title and premise from the quest prop", () => {
    const wrapper = mountMetadata({ title: "The Salt-Drowned Bell", summary: "Something rings under the tide." });
    const inputs = wrapper.findAll("input");
    expect(inputs[0]!.element.value).toBe("The Salt-Drowned Bell");
    expect(inputs[1]!.element.value).toBe("Something rings under the tide.");
  });

  it("saves the title on blur, falling back to a placeholder when cleared", async () => {
    const wrapper = mountMetadata();
    const titleInput = wrapper.find("input");
    await titleInput.setValue("   ");
    await titleInput.trigger("blur");
    await flushPromises();
    expect(mocks.updateQuest).toHaveBeenCalledWith(expect.objectContaining({
      id: "quest-1",
      update: expect.objectContaining({ title: "Untitled Quest" }),
    }));
  });

  // The database enforces this too (`quests_summary_is_one_line`, migration
  // 20260906160921) — the input-level cap is the fast, friendly version of the
  // same rule, not a substitute for it.
  it("caps the premise input at QUEST_SUMMARY_MAX, since players see it verbatim", () => {
    const wrapper = mountMetadata();
    const summaryInput = wrapper.findAll("input")[1]!;
    expect(summaryInput.attributes("maxlength")).toBe(String(QUEST_SUMMARY_MAX));
    // The placeholder names the audience: this field is shown to players
    // verbatim, so it must not read as a DM-only prompt (#799).
    expect(summaryInput.attributes("placeholder")).toContain("Players see this");
  });

  it("saves the premise trimmed, or null when cleared — summary is the premise, not the deleted description/notes columns", async () => {
    const wrapper = mountMetadata({ summary: "Something." });
    const summaryInput = wrapper.findAll("input")[1]!;
    await summaryInput.setValue("   ");
    await summaryInput.trigger("blur");
    await flushPromises();
    expect(mocks.updateQuest).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ summary: null }),
    }));
  });

  it("announces a campaign broadcast only the first time the quest becomes player-visible", async () => {
    const wrapper = mountMetadata({ player_visible_to: [] });
    wrapper.findComponent({ name: "AudienceRevealControl" }).vm.$emit("change", ["player-1"]);
    await flushPromises();
    expect(mocks.announce).toHaveBeenCalledTimes(1);
    expect(mocks.announce).toHaveBeenCalledWith(
      "campaign-1",
      expect.stringContaining("Quest shared"),
      expect.objectContaining({ entity_type: "quest", entity_id: "quest-1" }),
    );
  });

  it("does not re-announce a quest that is already shared", async () => {
    const wrapper = mountMetadata({ player_visible_to: ["player-1"] });
    wrapper.findComponent({ name: "AudienceRevealControl" }).vm.$emit("change", ["player-1", "player-2"]);
    await flushPromises();
    expect(mocks.announce).not.toHaveBeenCalled();
  });

  // "Opens at" — the DM's chosen entry beat. The DB re-defaults it once a
  // quest has any beat, so the field is disabled rather than offering an
  // empty option while there is nothing to choose from. There are several
  // EntityCombobox instances on this panel (giver, location, parent quest),
  // so every lookup below picks the "Opens at" one out by its own placeholder
  // rather than the first match.
  function opensAtCombobox(wrapper: ReturnType<typeof mountMetadata>) {
    return wrapper.findAllComponents({ name: "EntityCombobox" })
      .find((combobox) => combobox.props("placeholder") === "Choose the opening beat…");
  }

  it("renders Opens at disabled with a No beats yet placeholder when the quest has no beats", () => {
    mocks.beats = [];
    const wrapper = mountMetadata({ entry_beat_id: null });
    const disabledInput = wrapper.findAll("input").find((input) => input.attributes("placeholder") === "No beats yet");
    expect(disabledInput).toBeDefined();
    expect(disabledInput!.attributes("disabled")).toBeDefined();
    expect(opensAtCombobox(wrapper)).toBeUndefined();
  });

  it("syncs entry_beat_id into the Opens at combobox once the quest has beats", () => {
    mocks.beats = [{ id: "beat-1", title: "The rumor" }, { id: "beat-2", title: "The docks" }];
    const wrapper = mountMetadata({ entry_beat_id: "beat-2" });
    const combobox = opensAtCombobox(wrapper);
    expect(combobox).toBeDefined();
    expect(combobox!.props("modelValue")).toBe("beat-2");
    expect(combobox!.props("options")).toEqual([
      { id: "beat-1", name: "The rumor" },
      { id: "beat-2", name: "The docks" },
    ]);
  });

  it("saves a newly chosen entry beat alongside the rest of the metadata", async () => {
    mocks.beats = [{ id: "beat-1", title: "The rumor" }, { id: "beat-2", title: "The docks" }];
    const wrapper = mountMetadata({ entry_beat_id: "beat-1" });
    opensAtCombobox(wrapper)!.vm.$emit("update:modelValue", "beat-2");
    await flushPromises();
    expect(mocks.updateQuest).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ entry_beat_id: "beat-2" }),
    }));
  });

  it("snaps back instead of writing null when the box is cleared — a quest with beats always has an entry", async () => {
    mocks.beats = [{ id: "beat-1", title: "The rumor" }];
    const wrapper = mountMetadata({ entry_beat_id: "beat-1" });
    opensAtCombobox(wrapper)!.vm.$emit("update:modelValue", "");
    await flushPromises();
    expect(mocks.updateQuest).not.toHaveBeenCalled();
    expect(opensAtCombobox(wrapper)!.props("modelValue")).toBe("beat-1");
  });
});
