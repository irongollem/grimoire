import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const enabledSeen = vi.hoisted(() => ({ notes: [] as boolean[] }));
vi.mock("@/composables/notes/useNotes", () => ({
  useNotes: (enabled: () => boolean) => {
    enabledSeen.notes.push(enabled());
    return { data: ref([
      { id: "n1", title: "The ferry", session_id: "s4" },
      { id: "n2", title: "Loose note", session_id: null },
      { id: "n3", title: "Untied", session_id: "gone" },
    ]) };
  },
}));
vi.mock("@/composables/sessions/useCampaignSessions", () => ({
  useCampaignSessions: () => ({ data: ref([{ id: "s4", number: 4, title: "Into the Mere" }]) }),
}));

const { useChronicleSessionOptions } = await import("./askSessionNotes");

describe("useChronicleSessionOptions", () => {
  // Bug caught: a recap could be drafted about a loose note (the card's picker listed every note), and the server refused it after the button.
  it("lists only notes linked to a session, labelled by their session, and a note whose session is gone by its title", () => {
    const { options } = useChronicleSessionOptions(() => true);
    expect(options.value).toEqual([
      { id: "n1", name: "Session 4: Into the Mere: The ferry" },
      { id: "n3", name: "Untied" },
    ]);
  });

  // Bug caught: the always-mounted panel read every note of the campaign before any recap was asked for.
  it("reads nothing until enabled", () => {
    enabledSeen.notes = [];
    useChronicleSessionOptions(() => false);
    expect(enabledSeen.notes).toEqual([false]);
  });
});
