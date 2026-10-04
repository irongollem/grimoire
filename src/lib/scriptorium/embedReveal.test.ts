import { describe, expect, it } from "vitest";
import {
  describeEmbedReveal,
  effectiveEmbedReveal,
  embedHasRevealControl,
  normalizeEmbedReveal,
} from "./embedReveal";

describe("effectiveEmbedReveal", () => {
  it("npc: automatic reveals name and portrait", () => {
    expect(effectiveEmbedReveal({ entityType: "npc" })).toEqual({ type: "npc", fields: ["name", "portrait"] });
  });
  it("npc: automatic drops the portrait when the embed hides its art", () => {
    expect(effectiveEmbedReveal({ entityType: "npc", showArt: false })).toEqual({ type: "npc", fields: ["name"] });
  });
  it("npc: explicit fields win, off reveals nothing", () => {
    expect(effectiveEmbedReveal({ entityType: "npc", reveal: { fields: ["race", "name"] } })).toEqual({
      type: "npc",
      fields: ["race", "name"],
    });
    expect(effectiveEmbedReveal({ entityType: "npc", reveal: { off: true } })).toEqual({ type: "npc", fields: [] });
  });
  it("monster: automatic discovers without stats", () => {
    expect(effectiveEmbedReveal({ entityType: "monster" })).toEqual({ type: "monster", discover: true, stats: false });
    expect(effectiveEmbedReveal({ entityType: "monster", reveal: { stats: true } })).toEqual({
      type: "monster",
      discover: true,
      stats: true,
    });
    expect(effectiveEmbedReveal({ entityType: "monster", reveal: { off: true, stats: true } })).toEqual({
      type: "monster",
      discover: false,
      stats: false,
    });
  });
  it("location: automatic shares without the description", () => {
    expect(effectiveEmbedReveal({ entityType: "location" })).toEqual({
      type: "location",
      share: true,
      description: false,
    });
    expect(effectiveEmbedReveal({ entityType: "location", reveal: { description: true } })).toEqual({
      type: "location",
      share: true,
      description: true,
    });
    expect(effectiveEmbedReveal({ entityType: "location", reveal: { off: true } })).toEqual({
      type: "location",
      share: false,
      description: false,
    });
  });
  it("quest: starts unless off", () => {
    expect(effectiveEmbedReveal({ entityType: "quest" })).toEqual({ type: "quest", start: true });
    expect(effectiveEmbedReveal({ entityType: "quest", reveal: { off: true } })).toEqual({ type: "quest", start: false });
  });
  it("item and spell never reveal anything", () => {
    expect(effectiveEmbedReveal({ entityType: "item", reveal: { off: true } })).toEqual({ type: "item" });
    expect(effectiveEmbedReveal({ entityType: "spell" })).toEqual({ type: "spell" });
    expect(embedHasRevealControl("item")).toBe(false);
    expect(embedHasRevealControl("npc")).toBe(true);
  });
});

describe("describeEmbedReveal", () => {
  it("describes every type in its automatic state", () => {
    expect(describeEmbedReveal({ entityType: "npc" })).toBe("Reveals name and portrait");
    expect(describeEmbedReveal({ entityType: "monster" })).toBe("Discovers it");
    expect(describeEmbedReveal({ entityType: "location" })).toBe("Shares it");
    expect(describeEmbedReveal({ entityType: "quest" })).toBe("Starts the quest");
    expect(describeEmbedReveal({ entityType: "item" })).toBe("Shown once found");
    expect(describeEmbedReveal({ entityType: "spell" })).toBe("Shown once found");
  });
  it("describes explicit and off states", () => {
    expect(describeEmbedReveal({ entityType: "npc", reveal: { fields: ["name"] } })).toBe("Reveals name");
    expect(describeEmbedReveal({ entityType: "npc", reveal: { fields: ["portrait", "name", "race"] } })).toBe(
      "Reveals portrait, name and species",
    );
    expect(describeEmbedReveal({ entityType: "npc", reveal: { fields: [] } })).toBe("Reveals nothing");
    expect(describeEmbedReveal({ entityType: "npc", reveal: { off: true } })).toBe("Reveals nothing");
    expect(describeEmbedReveal({ entityType: "monster", reveal: { stats: true } })).toBe(
      "Discovers it and reveals its stats",
    );
    expect(describeEmbedReveal({ entityType: "location", reveal: { description: true } })).toBe(
      "Shares it and its description",
    );
    expect(describeEmbedReveal({ entityType: "quest", reveal: { off: true } })).toBe("Reveals nothing");
  });
});

describe("normalizeEmbedReveal", () => {
  it("treats anything that is not an object as automatic", () => {
    expect(normalizeEmbedReveal(null)).toBeNull();
    expect(normalizeEmbedReveal("x")).toBeNull();
    expect(normalizeEmbedReveal([])).toBeNull();
    expect(normalizeEmbedReveal({})).toBeNull();
  });
  it("drops unknown NPC field keys and keeps the rest", () => {
    expect(normalizeEmbedReveal({ off: true, fields: ["name", "status", 3], stats: true, junk: 1 })).toEqual({
      off: true,
      fields: ["name"],
      stats: true,
    });
  });
});
