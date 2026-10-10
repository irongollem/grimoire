import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const state = vi.hoisted(() => ({
  preview: false,
  journalQueries: 0,
  notesQueries: 0,
  rsvp: vi.fn(),
  journalSuccess: true,
}));

vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => ({ dmPreviewMode: state.preview }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "dm" } }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/composables/notes/usePlayerJournal", () => ({
  useMyJournalEntries: () => {
    state.journalQueries++;
    return { data: ref([]), isSuccess: ref(state.journalSuccess), isError: ref(false) };
  },
  useCreateJournalEntry: () => ({ mutateAsync: vi.fn() }),
  useUpdateJournalEntry: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/notes/useMyRecentNotes", () => ({
  useMyRecentNotes: () => {
    state.notesQueries++;
    return { notes: ref([]), isLoading: ref(false) };
  },
}));
vi.mock("@/composables/campaign/useCampaignMembers", () => ({ useCampaignMembers: () => ({ data: ref([]) }) }));
vi.mock("@/composables/calendar/useLocalToday", () => ({ useLocalToday: () => ref("2026-10-06") }));
vi.mock("@/composables/calendar/useScheduling", () => ({
  useSessionProposals: () => ({
    data: ref([{ id: "s1", status: "confirmed", proposed_date: "2026-10-10", title: null, min_attendance: 2 }]),
    isLoading: ref(false),
  }),
  useAllSessionAvailability: () => ({ data: ref([]), isLoading: ref(false) }),
  useUpsertAvailability: () => ({ mutate: state.rsvp, isError: ref(false) }),
}));

import HearthNextSession from "./HearthNextSession.vue";
import HearthNotes from "./HearthNotes.vue";
import HearthQuickNote from "./HearthQuickNote.vue";

const STUBS = {
  HearthNotesList: { template: '<div data-list="notes" />' },
  HearthQuickNoteEditor: { template: '<div data-editor="note" />' },
  RouterLink: true,
};

beforeEach(() => {
  state.preview = false;
  state.journalQueries = 0;
  state.notesQueries = 0;
  state.journalSuccess = true;
  state.rsvp.mockClear();
});

describe("Hearth in DM preview", () => {
  it("replaces the session notes with a notice and never reads or writes the journal", () => {
    state.preview = true;
    const w = mount(HearthQuickNote, { props: { startedAt: "2026-10-06T19:00:00Z" }, global: { stubs: STUBS } });
    expect(w.text()).toContain("Session notes are private to the player.");
    expect(w.find("[data-editor]").exists()).toBe(false);
    expect(state.journalQueries).toBe(0);
  });

  it("replaces Your notes with a notice and never runs the notes queries", () => {
    state.preview = true;
    const w = mount(HearthNotes, { global: { stubs: STUBS } });
    expect(w.text()).toContain("A player's own notes are private to them.");
    expect(state.notesQueries).toBe(0);
  });

  it("shows the next session but disables the RSVP, with a caption", () => {
    state.preview = true;
    const w = mount(HearthNextSession);
    expect(w.text()).toContain("The player answers here.");
    expect(w.text()).toContain("Confirmed");
    for (const b of w.findAll("button")) expect(b.attributes("disabled")).toBeDefined();
  });
});

describe("Hearth outside preview", () => {
  it("opens the session note editor once the journal has loaded and the session has a start", () => {
    const w = mount(HearthQuickNote, { props: { startedAt: "2026-10-06T19:00:00Z" }, global: { stubs: STUBS } });
    expect(w.find("[data-editor]").exists()).toBe(true);
  });

  it("holds the editor shut while the journal is loading", () => {
    state.journalSuccess = false;
    const w = mount(HearthQuickNote, { props: { startedAt: "2026-10-06T19:00:00Z" }, global: { stubs: STUBS } });
    expect(w.find("[data-editor]").exists()).toBe(false);
  });

  it("holds the editor shut while the session start is unknown", () => {
    const w = mount(HearthQuickNote, { props: { startedAt: null }, global: { stubs: STUBS } });
    expect(w.find("[data-editor]").exists()).toBe(false);
  });

  it("lists notes when not previewing", () => {
    const w = mount(HearthNotes, { global: { stubs: STUBS } });
    expect(w.find("[data-list]").exists()).toBe(true);
  });
});
