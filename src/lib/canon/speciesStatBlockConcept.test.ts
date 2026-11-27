import { describe, expect, it } from "vitest";
import { MONSTER_CONCEPT_MAX, statBlockRequest } from "./speciesStatBlockConcept";

const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const species = { name: "Marsh heron", kingdom: "animal" as const, livesAs: "colony" as const, activity: "twilight" as const, description: doc("Tall, grey, patient.") };
const adult = { label: "Adult", domesticated: false };

describe("statBlockRequest", () => {
  // Bug caught: the card opened with a concept that forgets what the species is, how it lives or when it is about.
  it("says the species, its description, how it lives and when it is about", () => {
    const { concept } = statBlockRequest(species, adult);
    expect(concept).toBe("A stat block for the Marsh heron (animal) of my world. Tall, grey, patient. It lives in colonies. It is about at dawn and dusk.");
  });

  // Bug caught: every form asking for the same monster ("Adult" spelled out, or the stage dropped for a young one).
  it("names a stage other than Adult, and keeps a domesticated breed as kept", () => {
    expect(statBlockRequest(species, adult).concept).not.toMatch(/Adult/);
    expect(statBlockRequest(species, { label: "Chick", domesticated: false }).concept).toContain("the Chick Marsh heron");
    expect(statBlockRequest(species, { label: "Household", domesticated: true }).concept).toContain("a kind that people keep");
  });

  // Bug caught: a plant or an animal opened as the wrong creature type, or a type forced on a kind with no rule.
  it("infers the monster type from the kingdom only where the rules have one", () => {
    expect(statBlockRequest(species, adult).inputs).toEqual({ monster_type: "beast" });
    expect(statBlockRequest({ ...species, kingdom: "plant" }, adult).inputs).toEqual({ monster_type: "plant" });
    expect(statBlockRequest({ ...species, kingdom: "other" }, adult).inputs).toEqual({});
  });

  // Bug caught: a long description overrunning the card's concept box, so the card opens already over its limit.
  it("cuts a long description to fit the concept box and keeps the tail", () => {
    const { concept } = statBlockRequest({ ...species, description: doc("x".repeat(3000)) }, adult);
    expect(concept.length).toBeLessThanOrEqual(MONSTER_CONCEPT_MAX);
    expect(concept.endsWith("It is about at dawn and dusk.")).toBe(true);
  });

  // Bug caught: "undefined" or a stray double space where a species has no description, way of life or hours.
  it("leaves out what the species does not say", () => {
    const { concept } = statBlockRequest({ ...species, description: null, livesAs: null, activity: null }, adult);
    expect(concept).toBe("A stat block for the Marsh heron (animal) of my world.");
  });
});
