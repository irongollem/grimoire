import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import FallenCharacterNotes from "./FallenCharacterNotes.vue";
import type { PlayerJournalEntry } from "@/composables/notes/usePlayerJournal";

const n = (id: string, title: string | null): PlayerJournalEntry =>
  ({ id, title, content: `<p>body ${id}</p>`, created_at: "2026-10-01T10:00:00Z" }) as unknown as PlayerJournalEntry;

describe("FallenCharacterNotes", () => {
  it("renders nothing for a character with no notes", () => {
    const w = mount(FallenCharacterNotes, { props: { name: "Mira", notes: [] } });
    expect(w.find("section").exists()).toBe(false);
  });

  it("lists each note under the character's name, with an untitled one still readable", () => {
    const w = mount(FallenCharacterNotes, { props: { name: "Mira", notes: [n("1", "Her oath"), n("2", null)] } });
    expect(w.text()).toContain("From Mira's journal");
    expect(w.text()).toContain("Her oath");
    expect(w.text()).toContain("Untitled");
    expect(w.text()).toContain("body 2");
  });
});
