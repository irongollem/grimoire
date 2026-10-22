import { describe, expect, it } from "vitest";
import {
  MAX_NOTES_CHARS,
  NPC_RELATIONSHIP_TYPES,
  sanitizeSuggestions,
  type SuggestionContext,
} from "./npcRelationshipSuggestions";

/** The plain suggestions, for the tests that predate kin. */
const sanitize = (raw: unknown, c: SuggestionContext) => sanitizeSuggestions(raw, c).suggestions;

const ctx: SuggestionContext = {
  sourceName: "Mara Voss",
  npcNames: ["Baelin Ironforge", "Mara Voss", "Tilda Fenn", "Old Corwin"],
  factionNames: ["The Iron Concord", "Dock Wardens"],
  existingNpcNames: ["Old Corwin"],
  existingFactionNames: ["Dock Wardens"],
};

describe("sanitizeSuggestions", () => {
  it("keeps valid npc and faction suggestions in candidate casing", () => {
    const out = sanitize(
      {
        suggestions: [
          { kind: "npc", target_name: "baelin ironforge", relationship_type: "rival", notes: "Old grudge." },
          { kind: "faction", target_name: "THE IRON CONCORD", role: "Informant", notes: "Sells secrets." },
        ],
      },
      ctx,
    );
    expect(out).toEqual([
      { kind: "npc", target_name: "Baelin Ironforge", relationship_type: "rival", notes: "Old grudge." },
      { kind: "faction", target_name: "The Iron Concord", role: "Informant", notes: "Sells secrets." },
    ]);
  });

  it("drops unknown names, self, already-related and duplicates", () => {
    const out = sanitize(
      {
        suggestions: [
          { kind: "npc", target_name: "Nobody Real", relationship_type: "ally", notes: "" },
          { kind: "npc", target_name: "Mara Voss", relationship_type: "ally", notes: "" },
          { kind: "npc", target_name: "Old Corwin", relationship_type: "ally", notes: "" },
          { kind: "faction", target_name: "Dock Wardens", role: "Guard", notes: "" },
          { kind: "npc", target_name: "Tilda Fenn", relationship_type: "friend", notes: "a" },
          { kind: "npc", target_name: "tilda fenn", relationship_type: "enemy", notes: "b" },
        ],
      },
      ctx,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ target_name: "Tilda Fenn", relationship_type: "friend" });
  });

  it("drops invalid relationship types and a type on the wrong kind", () => {
    const out = sanitize(
      [
        { kind: "npc", target_name: "Tilda Fenn", relationship_type: "bestie", notes: "" },
        { kind: "npc", target_name: "Baelin Ironforge", notes: "" },
        { kind: "faction", target_name: "Baelin Ironforge", role: "x", notes: "" },
      ],
      ctx,
    );
    expect(out).toEqual([]);
  });

  it("truncates notes and tolerates junk", () => {
    const out = sanitize(
      {
        suggestions: [
          "junk",
          null,
          { kind: "npc", target_name: "Tilda Fenn", relationship_type: "ally", notes: "x".repeat(500) },
        ],
      },
      ctx,
    );
    expect(out).toHaveLength(1);
    expect(out[0].notes.length).toBeLessThanOrEqual(MAX_NOTES_CHARS);
    expect(sanitize("nope", ctx)).toEqual([]);
    expect(sanitize({ suggestions: "no" }, ctx)).toEqual([]);
  });

  it("lists exactly the 13 bond types, none of them kin", () => {
    expect(NPC_RELATIONSHIP_TYPES).toHaveLength(13);
    expect(NPC_RELATIONSHIP_TYPES).not.toContain("family");
    expect(NPC_RELATIONSHIP_TYPES).not.toContain("sibling");
  });
});

describe("sanitizeSuggestions kin", () => {
  const kinCtx: SuggestionContext = {
    sourceName: "Wren Ashe",
    npcNames: ["Brenna Ashe", "Pip", "Corwin Ashe", "Dara Ashe", "Old Hob"],
    factionNames: [],
    existingNpcNames: ["Old Hob"],
    pcNames: ["Tamsin"],
    sourceBornYear: 1459,
    bornYears: { "npc:brenna ashe": 1430, "npc:pip": 1464, "npc:corwin ashe": 1459, "pc:tamsin": 1450 },
    existingKinNpcNames: ["Corwin Ashe"],
    existingKinPcNames: [],
    impliedSiblings: { "npc:dara ashe": "Brenna Ashe" },
  };
  const kin = (target_name: string, relation: string, extra: Record<string, unknown> = {}) => ({
    kind: "kin", target_name, target_type: "npc", relation, parent_role: null, notes: "Shares her surname.", ...extra,
  });

  it("keeps a plausible kin suggestion with its role and evidence", () => {
    const out = sanitizeSuggestions({ suggestions: [kin("brenna ashe", "parent", { parent_role: "mother" })] }, kinCtx);
    expect(out.suggestions).toEqual([
      { kind: "kin", target_name: "Brenna Ashe", target_type: "npc", relation: "parent", parent_role: "mother", notes: "Shares her surname." },
    ]);
    expect(out.setAside).toEqual([]);
  });

  it("drops the parent role off any relation but parent", () => {
    const out = sanitizeSuggestions({ suggestions: [kin("Brenna Ashe", "sibling", { parent_role: "mother" })] }, kinCtx);
    expect(out.suggestions[0]).toMatchObject({ relation: "sibling", parent_role: null });
  });

  it("resolves a PC target and tolerates a wrong target_type", () => {
    const out = sanitizeSuggestions({ suggestions: [kin("Tamsin", "sibling", { target_type: "npc" })] }, kinCtx);
    expect(out.suggestions[0]).toMatchObject({ target_name: "Tamsin", target_type: "pc" });
  });

  it("drops a pair a kin link already joins, unknown names and duplicates", () => {
    const out = sanitizeSuggestions(
      { suggestions: [kin("Corwin Ashe", "parent"), kin("Nobody", "parent"), kin("Brenna Ashe", "parent"), kin("brenna ashe", "relative")] },
      kinCtx,
    );
    expect(out.suggestions.map((s) => s.target_name)).toEqual(["Brenna Ashe"]);
  });

  it("sets aside a parent born after the child, in plain words", () => {
    const out = sanitizeSuggestions({ suggestions: [kin("Pip", "parent")] }, kinCtx);
    expect(out.suggestions).toEqual([]);
    expect(out.setAside).toEqual([{ target_name: "Pip", relation: "parent", reason: "Pip was born five years after Wren Ashe" }]);
  });

  it("sets aside a child born before or with the parent", () => {
    const out = sanitizeSuggestions({ suggestions: [kin("Brenna Ashe", "child"), kin("Tamsin", "child")] }, kinCtx);
    expect(out.suggestions).toEqual([]);
    expect(out.setAside.map((s) => s.reason)).toEqual([
      "Wren Ashe was born 29 years after Brenna Ashe",
      "Wren Ashe was born nine years after Tamsin",
    ]);
  });

  it("sets aside a same-year parent claim", () => {
    const out = sanitizeSuggestions({ suggestions: [kin("Tamsin", "parent", { target_type: "pc" })] }, { ...kinCtx, bornYears: { "pc:tamsin": 1459 } });
    expect(out.setAside[0].reason).toBe("Tamsin and Wren Ashe were born in the same year");
  });

  it("sets aside a sibling the shared parents already imply", () => {
    const out = sanitizeSuggestions({ suggestions: [kin("Dara Ashe", "sibling")] }, kinCtx);
    expect(out.suggestions).toEqual([]);
    expect(out.setAside).toEqual([{ target_name: "Dara Ashe", relation: "sibling", reason: "already siblings through Brenna Ashe" }]);
  });

  it("does not judge when a birth year is unknown", () => {
    const out = sanitizeSuggestions({ suggestions: [kin("Brenna Ashe", "parent")] }, { ...kinCtx, sourceBornYear: null });
    expect(out.suggestions).toHaveLength(1);
  });
});
