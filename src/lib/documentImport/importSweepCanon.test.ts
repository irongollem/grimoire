import { describe, expect, it } from "vitest";
import type { AiProvenance } from "@/ai/provenance";
import type { EntityCanonLinks } from "./normalize";
import { planCanonChildren, type CanonLookups } from "./importSweepCanon";

const PROVENANCE: AiProvenance = {
  generatorType: "document_import",
  provider: "anthropic",
  model: "claude-test",
  generatedAt: "2026-11-20T00:00:00.000Z",
  edited: false,
};

const lookups: CanonLookups = {
  npcs: [{ id: "n-tam", name: "Tam" }, { id: "n-twin", name: "Mere" }],
  factions: [{ id: "f-watch", name: "The Watch" }],
  party: [{ id: "p-ash", name: "Ashlyn" }],
  locations: [{ id: "l-dock", name: "Dock Ward" }, { id: "l-mere", name: "Mere" }],
  quests: [{ id: "q-bell", name: "The Sunken Bell" }],
  beats: [{ id: "b-ring", name: "The ringing" }],
};

function plan(canon: Partial<NonNullable<EntityCanonLinks["canon"]>> & { part: NonNullable<EntityCanonLinks["canon"]>["part"] }) {
  const full = { known_to: [], steps: [], quests: [], clues: [], passages: [], ...canon };
  return planCanonChildren([{ id: "e1", links: { canon: full } }], lookups, "c1", PROVENANCE);
}

describe("planCanonChildren: who knows a truth", () => {
  it("ties a truth to a person, a player character and a faction it names, from the entry outward", () => {
    const { worldLinks, unresolved } = plan({ part: "truth", known_to: ["Tam", "Ashlyn", "The Watch"] });
    expect(unresolved).toEqual([]);
    expect(worldLinks.map((w) => [w.from_kind, w.to_kind, w.type])).toEqual([
      ["canon", "npc", "known_to"],
      ["canon", "party_member", "known_to"],
      ["canon", "faction", "known_to"],
    ]);
    expect(worldLinks[0]).toMatchObject({ from_canon_entry_id: "e1", to_npc_id: "n-tam", campaign_id: "c1", ai_provenance: PROVENANCE });
  });

  it("never makes a link for a name that matches nothing: it is reported instead", () => {
    const { worldLinks, unresolved } = plan({ part: "truth", known_to: ["Nobody Here"] });
    expect(worldLinks).toEqual([]);
    expect(unresolved).toEqual([{ sourceId: "e1", relation: "who knows it", name: "Nobody Here" }]);
  });

  it("refuses a name that is two things at once rather than picking one", () => {
    // "Mere" is an NPC and a place; known_to takes people, so only the NPC counts: one hit, linked.
    expect(plan({ part: "truth", known_to: ["Mere"] }).worldLinks).toHaveLength(1);
    // Two NPCs of one name cannot be told apart.
    const twins: CanonLookups = { ...lookups, npcs: [{ id: "a", name: "Tam" }, { id: "b", name: "Tam" }] };
    const out = planCanonChildren([{ id: "e1", links: { canon: { part: "truth", known_to: ["Tam"], steps: [], quests: [], clues: [], passages: [] } } }], twins, "c1", PROVENANCE);
    expect(out.worldLinks).toEqual([]);
    expect(out.unresolved).toHaveLength(1);
  });

  it("writes one tie per person however often the book names them", () => {
    expect(plan({ part: "truth", known_to: ["Tam", "tam"] }).worldLinks).toHaveLength(1);
  });
});

describe("planCanonChildren: a force", () => {
  it("numbers its steps in the order the book gives them and ties it to the quests it names", () => {
    const { steps, forceQuests, unresolved } = plan({ part: "force", steps: ["buy the bridge", "close the ferry"], quests: ["The Sunken Bell", "The Lost One"] });
    expect(steps.map((s) => [s.title, s.sort_order, s.force_id])).toEqual([["buy the bridge", 0, "e1"], ["close the ferry", 1, "e1"]]);
    expect(forceQuests).toEqual([{ campaign_id: "c1", force_id: "e1", quest_id: "q-bell" }]);
    expect(unresolved).toEqual([{ sourceId: "e1", relation: "quest", name: "The Lost One" }]);
  });
});

describe("planCanonChildren: clues and passages", () => {
  it("places a clue at the one place, person or beat it names, and at most one", () => {
    const { clues } = plan({ part: "secret", clues: [{ title: "a locket", where: "Dock Ward" }, { title: "a name", where: "Tam" }, { title: "a bell", where: "The ringing" }] });
    expect(clues.map((c) => [c.location_id, c.npc_id, c.quest_beat_id])).toEqual([["l-dock", null, null], [null, "n-tam", null], [null, null, "b-ring"]]);
    expect(clues.every((c) => c.secret_id === "e1")).toBe(true);
  });

  it("writes a clue unplaced, and says so, when its place matches nothing or matches two things", () => {
    // "Mere" is both an NPC and a place: ambiguous, so the clue is not placed on either.
    const { clues, unresolved } = plan({ part: "secret", clues: [{ title: "a ripple", where: "Mere" }, { title: "a hum", where: "Nowhere" }] });
    expect(clues.map((c) => [c.title, c.location_id, c.npc_id, c.quest_beat_id])).toEqual([["a ripple", null, null, null], ["a hum", null, null, null]]);
    expect(unresolved.map((u) => u.name)).toEqual(["Mere", "Nowhere"]);
  });

  it("writes a lore passage with its body and place, numbered in order, under its entry", () => {
    const { passages } = plan({ part: "lore", passages: [{ title: "What all know", bodyJson: "{}" }, { title: "Deeper", bodyJson: null, where: "Dock Ward" }] });
    expect(passages.map((p) => [p.entry_id, p.title, p.body, p.sort_order, p.location_id])).toEqual([
      ["e1", "What all know", "{}", 0, null],
      ["e1", "Deeper", null, 1, "l-dock"],
    ]);
  });
});
