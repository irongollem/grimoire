import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ClueRow from "./ClueRow.vue";
import type { CanonClue } from "@/types/canon.types";

const clue: CanonClue = {
  id: "k", user_id: "u", campaign_id: "c", secret_id: "s", title: "A locket", sort_order: 0, location_id: null, npc_id: null, quest_beat_id: null,
  item_id: "i1", document_id: null, found_at: null, found_session_id: null, passage_id: null, ai_provenance: null, created_at: "", updated_at: "",
};
const row = (where: { kind: "item" | "document"; name: string | null } | null) =>
  mount(ClueRow, { props: { clue, where }, global: { stubs: { RouterLink: true } } });

describe("ClueRow", () => {
  // Bug: a clue in an item or a handout read "Not placed anywhere yet" because the row knew only places, people and beats.
  it("names the item or handout the clue lies in", () => {
    expect(row({ kind: "item", name: "The Marchpane Locket" }).text()).toContain("The Marchpane Locket");
    expect(row({ kind: "document", name: "A torn letter" }).text()).toContain("A torn letter");
    expect(row({ kind: "item", name: "The Marchpane Locket" }).find("[data-testid=clue-nowhere]").exists()).toBe(false);
  });

  it("says it lies nowhere yet when it does not", () => {
    expect(row(null).get("[data-testid=clue-nowhere]").text()).toBe("Not placed anywhere yet");
  });
});
