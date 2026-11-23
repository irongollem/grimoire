import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PlayerJournalDmNotesTab from "./PlayerJournalDmNotesTab.vue";
import type { Note } from "@/types/notes.types";

const note = (id: string, session_id: string | null): Note => ({ id, title: `Title ${id}`, session_id, content: "", tags: [], is_pinned: false, created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z" }) as unknown as Note;

const mountTab = (dmNotes: Note[]) =>
  mount(PlayerJournalDmNotesTab, {
    props: { isLoading: false, dmNotes, selectedNote: null, isNoteNew: () => false, formatDate: () => "1 Nov" },
    global: {
      stubs: {
        VirtualGrid: { props: ["items"], template: "<div><slot v-for='item in items' :item='item' /></div>" },
        JournalCard: { props: ["title"], template: "<article data-testid='card'>{{ title }}</article>" },
      },
    },
  });

describe("PlayerJournalDmNotesTab", () => {
  // Bug caught: a shared session note listed here as well as in The World's Chronicle.
  it("lists a plain shared note and leaves out one linked to a session", () => {
    const w = mountTab([note("plain", null), note("sess", "s1")]);
    const cards = w.findAll("[data-testid=card]").map((c) => c.text());
    expect(cards).toEqual(["Title plain"]);
  });

  // Bug caught: the empty state missing when only session notes were shared.
  it("shows the empty words when only session notes were shared", () => {
    expect(mountTab([note("sess", "s1")]).text()).toContain("No notes shared by your DM yet.");
  });
});
