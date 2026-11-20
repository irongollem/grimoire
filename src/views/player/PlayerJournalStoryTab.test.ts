import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { mount } from "@vue/test-utils";
import type { PlayerLorePassage } from "@/composables/canon/usePlayerCanon";

const mocks = vi.hoisted(() => ({ add: vi.fn(), markRead: vi.fn() }));
const state = vi.hoisted(() => ({ backstory: null as unknown, member: { id: "m1", name: "Tansy" } as unknown, readOnly: false, readAt: new Map<string, Date>() as Map<string, Date> | undefined }));
vi.mock("@/composables/canon/useMyStory", () => ({
  useMyStory: () => ({
    member: computed(() => state.member),
    backstory: computed(() => state.backstory),
    readOnly: computed(() => state.readOnly),
    isLoading: ref(false),
    error: ref(null),
    add: { mutate: mocks.add, isPending: ref(false) },
  }),
}));
vi.mock("@/composables/sessions/usePlayerSessions", () => ({ usePlayerSessions: () => ({ data: ref([{ number: 15, started_at: "2026-10-08T18:00:00Z" }]) }) }));
vi.mock("@/composables/player/useReadItems", () => ({
  useReadItems: () => ({ readAt: computed(() => state.readAt) }),
  useMarkRead: () => ({ mutate: mocks.markRead }),
}));

import PlayerJournalStoryTab from "./PlayerJournalStoryTab.vue";

const p = (over: Partial<PlayerLorePassage>): PlayerLorePassage => ({
  id: "g", entry_id: "b1", sort_order: 0, title: "t", body: null, told_at: "2026-10-12T09:00:00Z", by_dm: false, written_at: "2026-10-10T09:00:00Z", ...over,
});
const mountTab = () =>
  mount(PlayerJournalStoryTab, { global: { stubs: { BackstoryBeforePlay: true, StoryPassage: { name: "StoryPassage", props: ["passage", "when", "isNew", "editable"], template: "<div data-testid='passage' :data-editable='editable' :data-new='isNew' :data-when='when'>{{ passage.title }}</div>" } } } });

describe("PlayerJournalStoryTab", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    state.member = { id: "m1", name: "Tansy" };
    state.readOnly = false;
    state.readAt = new Map();
    state.backstory = { entry: { id: "b1" }, memberId: "m1", latestDmAt: null, passages: [p({ id: "mine", title: "Mine" }), p({ id: "dm", title: "From the DM", by_dm: true, told_at: "2026-10-12T09:00:00Z" })] };
  });

  // Bug caught: the player offered an editor on the DM's passage.
  it("lets the player edit their own passages and not the DM's", () => {
    const rows = mountTab().findAll("[data-testid=passage]");
    expect(rows.map((r) => [r.text(), r.attributes("data-editable")])).toEqual([["Mine", "true"], ["From the DM", "false"]]);
  });

  it("dates each passage by the session it was written after", () => {
    expect(mountTab().findAll("[data-testid=passage]")[0]?.attributes("data-when")).toBe("after session 15");
  });

  // Bug caught: every DM passage flagged New, or the player's own, so New stopped meaning "since you last looked".
  it("marks only the newest DM-told passage New, and only when the player has not opened the tab since", () => {
    state.backstory = { entry: { id: "b1" }, memberId: "m1", latestDmAt: null, passages: [
      p({ id: "old", title: "Old", by_dm: true, told_at: "2026-10-05T09:00:00Z" }),
      p({ id: "new", title: "New one", by_dm: true, told_at: "2026-10-12T09:00:00Z" }),
      p({ id: "mine", title: "Mine", told_at: "2026-10-20T09:00:00Z" }),
    ] };
    state.readAt = new Map([["b1", new Date("2026-10-01T00:00:00Z")]]);
    expect(mountTab().findAll("[data-testid=passage]").map((r) => r.attributes("data-new"))).toEqual(["false", "true", "false"]);
    state.readAt = new Map([["b1", new Date("2026-10-15T00:00:00Z")]]);
    expect(mountTab().findAll("[data-testid=passage]").map((r) => r.attributes("data-new"))).toEqual(["false", "false", "false"]);
  });

  it("marks the story read when opened, once the read markers have loaded, not before", () => {
    state.readAt = undefined;
    mountTab();
    expect(mocks.markRead).not.toHaveBeenCalled();
    state.readAt = new Map();
    mountTab();
    expect(mocks.markRead).toHaveBeenCalledWith({ entityType: "canon_backstory", entityId: "b1" });
  });

  it("adds to the story sharing with the party by default, and not when the player turns it off", async () => {
    const w = mountTab();
    await w.find("[data-testid=add-to-story]").trigger("submit");
    expect(mocks.add).toHaveBeenLastCalledWith({ shareWithParty: true });
    await w.find("input[type=checkbox]").setValue(false);
    await w.find("[data-testid=add-to-story]").trigger("submit");
    expect(mocks.add).toHaveBeenLastCalledWith({ shareWithParty: false });
  });

  // Bug caught: a DM previewing a player saw Add to my story and wrote into the player's story.
  it("offers no way to write, and no editor on any passage, while a DM previews", () => {
    state.readOnly = true;
    const w = mountTab();
    expect(w.find("[data-testid=add-to-story]").exists()).toBe(false);
    expect(w.findAll("[data-testid=passage]").every((r) => r.attributes("data-editable") === "false")).toBe(true);
  });

  it("still invites the first passage when nothing has been written yet", () => {
    state.backstory = null;
    expect(mountTab().find("[data-testid=add-to-story]").exists()).toBe(true);
  });
});
