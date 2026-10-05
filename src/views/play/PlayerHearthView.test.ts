import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlayerHearthView from "./PlayerHearthView.vue";

const state = vi.hoisted(() => ({
  linkedPartyMemberId: null as string | null,
  dmPreviewMode: false,
  dmPreviewPartyMemberId: null as string | null,
  isRunning: false,
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ linkedPartyMemberId: state.linkedPartyMemberId }),
}));
vi.mock("@/stores/ui", () => ({
  useUiStore: () => ({ dmPreviewMode: state.dmPreviewMode, dmPreviewPartyMemberId: state.dmPreviewPartyMemberId }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: "campaign-1", activeCampaign: { name: "The Southern Road" } }),
}));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({ data: ref([{ id: "pm-1", name: "Wren Ashdown" }]) }),
}));
vi.mock("@/composables/campaign/useCampaignSession", () => ({
  usePlayerSessionState: () => ({
    data: ref({ isRunning: state.isRunning, startedAt: state.isRunning ? "2026-10-05T19:00:00Z" : null }),
  }),
}));

const SECTIONS = [
  "HearthFirstVisit",
  "HearthDateStrip",
  "HearthCharacterCard",
  "HearthNextSession",
  "HearthNewForYou",
  "HearthQuests",
  "HearthNotes",
  "HearthLiveBanner",
  "HearthVitals",
  "HearthSpellcasting",
  "HearthWaiting",
  "HearthRightNow",
  "HearthQuickNote",
] as const;

function mountView() {
  return mount(PlayerHearthView, {
    global: { stubs: Object.fromEntries(SECTIONS.map((name) => [name, { template: `<div data-section="${name}" />` }])) },
  });
}

function sections(wrapper: ReturnType<typeof mountView>): string[] {
  return wrapper.findAll("[data-section]").map((el) => el.attributes("data-section") ?? "");
}

describe("PlayerHearthView", () => {
  beforeEach(() => {
    state.linkedPartyMemberId = null;
    state.dmPreviewMode = false;
    state.dmPreviewPartyMemberId = null;
    state.isRunning = false;
  });

  it("names the campaign", () => {
    expect(mountView().find("h1").text()).toBe("The Southern Road");
  });

  it("shows only the first-visit page to a player with no character", () => {
    expect(sections(mountView())).toEqual(["HearthFirstVisit"]);
  });

  it("shows the between-sessions sections when a character is linked and no session is running", () => {
    state.linkedPartyMemberId = "pm-1";
    expect(sections(mountView()).sort()).toEqual(
      ["HearthCharacterCard", "HearthDateStrip", "HearthNewForYou", "HearthNextSession", "HearthNotes", "HearthQuests"].sort(),
    );
  });

  it("switches to the at-the-table sections the moment the session runs", () => {
    state.linkedPartyMemberId = "pm-1";
    state.isRunning = true;
    expect(sections(mountView()).sort()).toEqual(
      ["HearthLiveBanner", "HearthQuickNote", "HearthRightNow", "HearthSpellcasting", "HearthVitals", "HearthWaiting"].sort(),
    );
  });

  it("keeps a character-less player on the first-visit page even while a session runs", () => {
    state.isRunning = true;
    expect(sections(mountView())).toEqual(["HearthFirstVisit"]);
  });

  it("asks a previewing DM to pick a character instead of showing first-visit", () => {
    state.dmPreviewMode = true;
    const wrapper = mountView();
    expect(sections(wrapper)).toEqual([]);
    expect(wrapper.text()).toContain("Select a character above");
  });

  it("follows the previewed character in DM preview", () => {
    state.dmPreviewMode = true;
    state.dmPreviewPartyMemberId = "pm-1";
    expect(sections(mountView())).toContain("HearthCharacterCard");
  });
});
