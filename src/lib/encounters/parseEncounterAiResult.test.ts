import { describe, it, expect } from "vitest";
import { parseEncounterAiResult } from "./parseEncounterAiResult";

describe("parseEncounterAiResult", () => {
  it("parses a well-formed payload unchanged", () => {
    const raw = {
      name: "Goblin Ambush at Thornwood Crossing",
      difficulty: "medium",
      environment: "Forest road at dusk",
      tactics: "Boss signals the ambush once flanked.",
      twist: "One goblin begs for mercy mid-fight",
      combatants: [
        { name: "Goblin Boss", count: 1, role: "Leader" },
        { name: "Goblin", count: 4, role: "Flanker" },
      ],
    };
    expect(parseEncounterAiResult(raw)).toEqual(raw);
  });

  it("throws when combatants is missing", () => {
    expect(() => parseEncounterAiResult({ name: "Ambush", difficulty: "medium" })).toThrow(
      "AI returned malformed encounter data — please try again.",
    );
  });

  it("throws when combatants is not an array", () => {
    expect(() =>
      parseEncounterAiResult({ name: "Ambush", combatants: "not-an-array" }),
    ).toThrow("AI returned malformed encounter data — please try again.");
  });

  it("throws when combatants is an empty array", () => {
    expect(() => parseEncounterAiResult({ name: "Ambush", combatants: [] })).toThrow(
      "AI returned malformed encounter data — please try again.",
    );
  });

  it("keeps a combatant missing role, coercing role to an empty string", () => {
    const result = parseEncounterAiResult({
      name: "Ambush",
      combatants: [{ name: "Goblin", count: 2 }],
    });
    expect(result.combatants).toEqual([{ name: "Goblin", count: 2, role: "" }]);
  });

  it("drops a combatant missing a name", () => {
    const result = parseEncounterAiResult({
      name: "Ambush",
      combatants: [{ count: 2, role: "Flanker" }, { name: "Goblin", count: 1, role: "" }],
    });
    expect(result.combatants).toEqual([{ name: "Goblin", count: 1, role: "" }]);
  });

  it("drops a combatant whose name is an empty/whitespace string", () => {
    const result = parseEncounterAiResult({
      name: "Ambush",
      combatants: [{ name: "   ", count: 2 }, { name: "Goblin", count: 1 }],
    });
    expect(result.combatants).toEqual([{ name: "Goblin", count: 1, role: "" }]);
  });

  it("throws when every combatant is dropped", () => {
    expect(() =>
      parseEncounterAiResult({
        name: "Ambush",
        combatants: [{ count: 2 }, { name: "" }, "not-an-object"],
      }),
    ).toThrow("AI returned malformed encounter data — please try again.");
  });

  it("falls back count to 1 when NaN or absent", () => {
    const result = parseEncounterAiResult({
      name: "Ambush",
      combatants: [
        { name: "Goblin", count: NaN },
        { name: "Kobold" },
      ],
    });
    expect(result.combatants.map((c) => c.count)).toEqual([1, 1]);
  });

  it("falls back difficulty to medium when missing or unrecognized", () => {
    const missing = parseEncounterAiResult({
      name: "Ambush",
      combatants: [{ name: "Goblin" }],
    });
    expect(missing.difficulty).toBe("medium");

    const unrecognized = parseEncounterAiResult({
      name: "Ambush",
      difficulty: "auto",
      combatants: [{ name: "Goblin" }],
    });
    expect(unrecognized.difficulty).toBe("medium");
  });

  it("falls back name to '???' when missing or not a string", () => {
    const result = parseEncounterAiResult({ combatants: [{ name: "Goblin" }] });
    expect(result.name).toBe("???");
  });

  it("drops optional prose fields to empty strings when absent", () => {
    const result = parseEncounterAiResult({
      name: "Ambush",
      combatants: [{ name: "Goblin" }],
    });
    expect(result.environment).toBe("");
    expect(result.tactics).toBe("");
    expect(result.twist).toBe("");
  });

  it("throws on non-object input", () => {
    expect(() => parseEncounterAiResult("just a string")).toThrow(
      "AI returned malformed encounter data — please try again.",
    );
    expect(() => parseEncounterAiResult(null)).toThrow(
      "AI returned malformed encounter data — please try again.",
    );
    expect(() => parseEncounterAiResult(42)).toThrow(
      "AI returned malformed encounter data — please try again.",
    );
  });
});
