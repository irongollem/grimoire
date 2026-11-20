import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import type { PlayerLorePassage } from "@/composables/canon/usePlayerCanon";

vi.mock("@/composables/canon/useMyStory", () => ({ updateMyPassage: vi.fn(), useRemoveMyPassage: () => ({ mutate: vi.fn() }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));

import StoryPassage from "./StoryPassage.vue";

const passage = (over: Partial<PlayerLorePassage>): PlayerLorePassage => ({
  id: "g1", entry_id: "b1", sort_order: 0, title: "After the Mere", body: null, told_at: "2026-10-10T09:00:00Z", by_dm: false, written_at: "2026-10-10T09:00:00Z", ...over,
});
const mountPassage = (p: PlayerLorePassage, extra: Record<string, unknown> = {}) =>
  mount(StoryPassage, { props: { passage: p, when: "after session 15", editable: !p.by_dm, ...extra }, global: { stubs: { RichTextEditor: true, RichTextViewer: true } } });

describe("StoryPassage", () => {
  // Bug caught: an edit field on a passage the DM wrote, which the database would refuse after the player had typed into it.
  it("offers no edit and no remove on a passage the DM told, and marks it", () => {
    const w = mountPassage(passage({ by_dm: true }));
    expect(w.find("[data-testid=story-byline]").text()).toBe("Told by the DM");
    expect(w.findComponent({ name: "AppInput" }).exists()).toBe(false);
    expect(w.findComponent({ name: "RichTextEditor" }).exists()).toBe(false);
    expect(w.find("[data-testid=story-remove]").exists()).toBe(false);
    expect(w.text()).toContain("After the Mere");
  });

  it("lets the player edit and remove a passage of their own, dated by the session they wrote it after", () => {
    const w = mountPassage(passage({}));
    expect(w.find("[data-testid=story-byline]").text()).toBe("You, after session 15");
    expect(w.findComponent({ name: "AppInput" }).exists()).toBe(true);
    expect(w.findComponent({ name: "RichTextEditor" }).exists()).toBe(true);
    expect(w.find("[data-testid=story-remove]").exists()).toBe(true);
  });

  // Bug caught: a DM previewing the player was handed the player's editor, and wrote under the player's name.
  it("is read-only when not editable, even for the player's own passage", () => {
    const w = mountPassage(passage({}), { editable: false });
    expect(w.findComponent({ name: "AppInput" }).exists()).toBe(false);
  });

  it("marks the newest DM passage New", () => {
    expect(mountPassage(passage({ by_dm: true }), { isNew: true }).find("[data-testid=story-new]").exists()).toBe(true);
    expect(mountPassage(passage({ by_dm: true })).find("[data-testid=story-new]").exists()).toBe(false);
  });
});
