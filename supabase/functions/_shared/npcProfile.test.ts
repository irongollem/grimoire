import { describe, expect, it } from "vitest";
import { shownNpcName, buildNpcProfile, type NpcProfileRow } from "./npcProfile";

function row(over: Partial<NpcProfileRow> = {}): NpcProfileRow {
  return {
    id: "n1", campaign_id: "c1", name: "Aldric Thorne", race: null, alignment: null, age: null,
    born_year: null, born_month: null, born_day: null, occupation: null, status: "alive",
    relationship: "indifferent", personality: null, voice: null, backstory: null, notes: null,
    disguise_name: null, is_revealed: false, ...over,
  };
}

describe("buildNpcProfile", () => {
  it("never sends the true name of a disguised, unrevealed NPC", () => {
    const p = buildNpcProfile(row({ disguise_name: "Old Man Reyes", is_revealed: false, backstory: "A quiet life." }), null);
    expect(p).toContain("Name: Old Man Reyes");
    expect(p).not.toContain("Aldric");
    expect(p).not.toContain("Thorne");
  });

  it("shows the true name once the NPC is revealed", () => {
    const p = buildNpcProfile(row({ disguise_name: "Old Man Reyes", is_revealed: true }), null);
    expect(p).toContain("Name: Aldric Thorne");
    expect(p).not.toContain("Reyes");
  });

  it("emits no empty label for an absent field", () => {
    const p = buildNpcProfile(row(), null);
    for (const line of p.split("\n")) expect(line).not.toMatch(/:\s*$/);
    expect(p).not.toContain("Personality");
    expect(p).not.toContain("null");
  });
});

describe("the name a character is shown under", () => {
  it("is the disguise until the reveal, or the scene list and the speech box would give the true name away", () => {
    expect(shownNpcName({ name: "Lady Vex", disguise_name: "Old Marta", is_revealed: false })).toBe("Old Marta");
  });

  it("is the true name once revealed, and for someone with no disguise", () => {
    expect(shownNpcName({ name: "Lady Vex", disguise_name: "Old Marta", is_revealed: true })).toBe("Lady Vex");
    expect(shownNpcName({ name: "Bram", disguise_name: null, is_revealed: false })).toBe("Bram");
  });
});

describe("how a character talks", () => {
  it("reaches the model on a line of its own, or every character speaks in the same measured voice", () => {
    const p = buildNpcProfile(row({ voice: "Clipped. Counts on her fingers. 'Three things, then we go.'" }), null);
    expect(p.split("\n").some((line) => line.startsWith("Voice") && line.includes("Three things, then we go."))).toBe(true);
  });

  it("adds no voice line for a character without one", () => {
    expect(buildNpcProfile(row({ voice: "   " }), null)).not.toContain("Voice");
  });

  it("cuts a voice that has grown into an essay", () => {
    const p = buildNpcProfile(row({ voice: "x".repeat(900) }), null);
    const line = p.split("\n").find((l) => l.startsWith("Voice"));
    expect(line && line.length).toBeLessThan(460);
  });
});
