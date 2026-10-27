import { describe, it, expect } from "vitest";
import { buildNpcVoiceProfile } from "./buildNpcVoiceProfile";
import type { Npc } from "@/types/npc.types";

function makeNpc(overrides: Partial<Npc> = {}): Npc {
  return {
    id: "npc-1",
    user_id: "user-1",
    campaign_id: "campaign-1",
    name: "Aldric Thorne",
    race: "Human",
    alignment: "Lawful Neutral",
    age: "47",
    born_year: null,
    born_month: null,
    born_day: null,
    died_year: null,
    died_month: null,
    died_day: null,
    occupation: "Merchant",
    location_id: null,
    appearance: null,
    personality: "Gruff but fair; drives a hard bargain but never cheats.",
    backstory: "Once a soldier in the border wars, now trades in salvaged arms.",
    notes: null,
    status: "alive",
    relationship: "indifferent",
    portrait_url: null,
    cutout_url: null,
    portrait_focal_point: null,
    disguise_name: null,
    disguise_portrait_url: null,
    disguise_portrait_focal_point: null,
    is_revealed: true,
    tags: [],
    stat_block: null,
    linked_monster_id: null,
    scriptorium_doc_id: null,
    player_visible_to: [],
    player_visible_fields: [],
    unmasked_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildNpcVoiceProfile", () => {
  it("includes the real name for an undisguised NPC", () => {
    const npc = makeNpc();
    const profile = buildNpcVoiceProfile(npc);
    expect(profile).toContain("Name: Aldric Thorne");
  });

  it("carries each field under its own label", () => {
    const profile = buildNpcVoiceProfile(makeNpc({ notes: "Owes the guild." }));
    expect(profile).toContain("Race: Human");
    expect(profile).toContain("Alignment: Lawful Neutral");
    expect(profile).toContain("Occupation: Merchant");
    expect(profile).toContain("Personality: Gruff but fair");
    expect(profile).toContain("Backstory: Once a soldier");
    expect(profile).toContain("Notes: Owes the guild.");
  });

  it("an unrevealed NPC with no disguise is simply itself, not a disguise with no name", () => {
    const profile = buildNpcVoiceProfile(makeNpc({ disguise_name: null, is_revealed: false }));
    expect(profile).toContain("Name: Aldric Thorne");
    expect(profile).not.toContain("IMPORTANT");
    expect(profile).not.toContain("null");
  });

  it("presents the disguise name and never leaks the true name when unrevealed", () => {
    const npc = makeNpc({
      name: "Aldric Thorne",
      disguise_name: "Old Man Reyes",
      is_revealed: false,
    });
    const profile = buildNpcVoiceProfile(npc);

    expect(profile).toContain("Name: Old Man Reyes");
    expect(profile).toContain("Old Man Reyes");
    // The load-bearing assertion: the true name must not appear anywhere in
    // the profile handed to the model, under any label or in any sentence.
    expect(profile).not.toContain(npc.name);
  });

  it("uses the true name once the disguise has been revealed", () => {
    const npc = makeNpc({
      name: "Aldric Thorne",
      disguise_name: "Old Man Reyes",
      is_revealed: true,
    });
    const profile = buildNpcVoiceProfile(npc);

    expect(profile).toContain("Name: Aldric Thorne");
    expect(profile).not.toContain("IMPORTANT: This NPC is currently in disguise");
  });

  it("omits absent optional fields entirely rather than emitting an empty label", () => {
    const npc = makeNpc({
      race: null,
      alignment: null,
      age: null,
      born_year: null,
      born_month: null,
      born_day: null,
      occupation: null,
      personality: null,
      backstory: null,
      notes: null,
    });
    const profile = buildNpcVoiceProfile(npc);

    expect(profile).not.toContain("Race:");
    expect(profile).not.toContain("Alignment:");
    expect(profile).not.toContain("Age:");
    expect(profile).not.toContain("Occupation:");
    expect(profile).not.toContain("Personality:");
    expect(profile).not.toContain("Backstory:");
    expect(profile).not.toContain("Notes:");
    // Status and relationship are always emitted (non-nullable fields).
    expect(profile).toContain("Status: alive");
    expect(profile).toContain("Relationship toward the party: indifferent");
  });

  it("truncates long personality and backstory text to the edge function's limits", () => {
    const longPersonality = "P".repeat(1000);
    const longBackstory = "B".repeat(1000);
    const npc = makeNpc({ personality: longPersonality, backstory: longBackstory });
    const profile = buildNpcVoiceProfile(npc);

    expect(profile).toContain(`Personality: ${"P".repeat(800)}`);
    expect(profile).not.toContain("P".repeat(801));
    expect(profile).toContain(`Backstory: ${"B".repeat(600)}`);
    expect(profile).not.toContain("B".repeat(601));
  });

  it("truncates long notes text to the edge function's limit", () => {
    const longNotes = "N".repeat(1000);
    const npc = makeNpc({ notes: longNotes });
    const profile = buildNpcVoiceProfile(npc);

    expect(profile).toContain(`Notes: ${"N".repeat(600)}`);
    expect(profile).not.toContain("N".repeat(601));
  });

  describe("age line", () => {
    const today = { year: 1495, month: 6, day: 15 };

    it("shows the computed age when a birth year is stored", () => {
      const profile = buildNpcVoiceProfile(makeNpc({ age: "ancient", born_year: 1448 }), today);
      expect(profile).toContain("Age: 47");
      expect(profile).not.toContain("ancient");
    });

    it("counts an upcoming birthday as not yet lived", () => {
      const npc = makeNpc({ born_year: 1448, born_month: 12, born_day: 1 });
      expect(buildNpcVoiceProfile(npc, today)).toContain("Age: 46");
    });

    it("keeps the free text without a birth year or without today", () => {
      expect(buildNpcVoiceProfile(makeNpc({ age: "47" }), today)).toContain("Age: 47");
      expect(buildNpcVoiceProfile(makeNpc({ age: "elderly", born_year: 1448 }))).toContain("Age: elderly");
    });
  });
});
