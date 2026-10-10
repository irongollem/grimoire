import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlayerHearthView from "./PlayerHearthView.vue";

const state = vi.hoisted(() => ({
  linkedPartyMemberId: null as string | null,
  dmPreviewMode: false,
  dmPreviewPartyMemberId: null as string | null,
  isRunning: false,
  partyLoaded: true,
  sessionLoaded: true,
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ linkedPartyMemberId: state.linkedPartyMemberId }),
}));
vi.mock("@/stores/ui/app", () => ({
  useAppUiStore: () => ({
    get dmPreviewMode() { return state.dmPreviewMode; },
    get dmPreviewPartyMemberId() { return state.dmPreviewPartyMemberId; },
  }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: "campaign-1", activeCampaign: { name: "The Southern Road" } }),
}));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({
    data: ref(state.partyLoaded ? [{ id: "pm-1", name: "Wren Ashdown" }] : undefined),
    isError: ref(false),
  }),
}));
// The surface reads the active party; here it is the same fixture as useParty.
vi.mock("@/composables/party/useActiveParty", async () => ({
  useActiveParty: (await import("@/composables/party/useParty")).useParty,
}));
vi.mock("@/composables/campaign/useCampaignSession", () => ({
  usePlayerSessionState: () => ({
    data: ref(
      state.sessionLoaded
        ? { isRunning: state.isRunning, startedAt: state.isRunning ? "2026-10-05T19:00:00Z" : null, sessionId: null, number: null, title: null }
        : undefined,
    ),
    isError: ref(false),
  }),
}));

// The view starts the sections' reads early (see the comment in the view); these
// are the hooks it hoists, stubbed so the test needs no query client.
const hoisted = vi.hoisted(() => ({ recentNotesEnabled: [] as Array<() => boolean> }));
vi.mock("@/composables/campaign/useCampaignMembers", () => ({ useCampaignMembers: () => ({}) }));
vi.mock("@/composables/calendar/useCalendarEvents", () => ({ usePlayerCalendarEventsRange: () => ({}) }));
vi.mock("@/composables/calendar/useScheduling", () => ({
  useSessionProposals: () => ({}),
  useAllSessionAvailability: () => ({}),
}));
vi.mock("@/composables/notes/useMyRecentNotes", () => ({
  useMyRecentNotes: (_limit: number, enabled: () => boolean) => hoisted.recentNotesEnabled.push(enabled),
}));
vi.mock("@/composables/party/useArmorClass", () => ({ useArmorClass: () => ({}) }));
vi.mock("@/composables/party/useCharacterClasses", () => ({ useCharacterClasses: () => ({}) }));
vi.mock("@/composables/quests/useQuestFlow", () => ({ usePlayerQuestBeats: () => ({}) }));
vi.mock("@/composables/quests/useQuests", () => ({ usePlayerVisibleQuests: () => ({}) }));

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
  "HearthChecks",
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
    state.partyLoaded = true;
    state.sessionLoaded = true;
  });

  it("starts the player's own notes read early only outside DM preview", () => {
    hoisted.recentNotesEnabled.length = 0;
    mountView();
    expect(hoisted.recentNotesEnabled).toHaveLength(1);
    state.dmPreviewMode = false;
    expect(hoisted.recentNotesEnabled[0]!()).toBe(true);
    state.dmPreviewMode = true;
    expect(hoisted.recentNotesEnabled[0]!()).toBe(false);
  });

  it("shows a loader, not the first-visit page, while a linked player's party is still loading", () => {
    state.linkedPartyMemberId = "pm-1";
    state.partyLoaded = false;
    const wrapper = mountView();
    expect(sections(wrapper)).toEqual([]);
    expect(wrapper.text()).not.toContain("Select a character");
  });

  it("holds the between-sessions page back until the session state has loaded", () => {
    state.linkedPartyMemberId = "pm-1";
    state.sessionLoaded = false;
    expect(sections(mountView())).toEqual([]);
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
      ["HearthChecks", "HearthLiveBanner", "HearthQuickNote", "HearthRightNow", "HearthSpellcasting", "HearthVitals", "HearthWaiting"].sort(),
    );
  });

  it("reads at the table as vitals, spellcasting, checks, then waiting, right now, session notes", () => {
    state.linkedPartyMemberId = "pm-1";
    state.isRunning = true;
    expect(sections(mountView())).toEqual([
      "HearthLiveBanner", "HearthVitals", "HearthSpellcasting", "HearthChecks", "HearthWaiting", "HearthRightNow", "HearthQuickNote",
    ]);
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
