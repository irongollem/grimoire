import { describe, expect, it } from "vitest";
import {
  MAX_NOTES_CHARS,
  MAX_SUGGESTIONS,
  connectableKinds,
  linkOptions,
  sanitizeSuggestions,
  typeGuide,
  withTargetIds,
  type SuggestionContext,
} from "./connectionSuggestions";
import { WORLD_LINK_PAIRS } from "./worldLinkCatalogue";

const npcCtx: SuggestionContext = {
  subjectKind: "npc",
  sourceName: "Mara Voss",
  candidates: {
    npc: ["Baelin Ironforge", "Mara Voss", "Tilda Fenn", "Old Corwin"],
    faction: ["The Iron Concord", "Dock Wardens"],
    location: ["Weir Chapel"],
    deity: ["The Drowned Lady"],
    item: ["The Ferry Bell"],
  },
  existingLinks: [{ kind: "npc", name: "Old Corwin", type: "friend", outward: true }],
  existingMemberNames: ["Dock Wardens"],
};

const sanitize = (raw: unknown, c: SuggestionContext = npcCtx) => sanitizeSuggestions(raw, c);
const link = (target_kind: string, target_name: string, type: string, extra: Record<string, unknown> = {}) => ({
  kind: "link", target_kind, target_name, type, notes: "", ...extra,
});

describe("the catalogue, read for a subject", () => {
  it("offers a type once when symmetric and both ways when two people can hold it either way", () => {
    const options = linkOptions("npc", "npc");
    expect(options.filter((o) => o.key === "friend")).toHaveLength(1);
    expect(options.filter((o) => o.key === "mentor_of").map((o) => [o.word, o.subjectIsFrom])).toEqual([
      ["mentor of", true],
      ["apprentice of", false],
    ]);
  });

  it("reads a place's types from the place, backwards", () => {
    const options = linkOptions("location", "faction");
    expect(options.find((o) => o.key === "controls")).toEqual({ key: "controls", word: "controlled by", subjectIsFrom: false });
  });

  it("holds a faction's stance to its own direction", () => {
    expect(linkOptions("faction", "faction").every((o) => o.subjectIsFrom)).toBe(true);
  });

  it("lists every kind a person can be tied to, and the guide names a membership for factions", () => {
    expect(connectableKinds("npc")).toEqual(["npc", "party_member", "faction", "location", "deity", "item"]);
    expect(typeGuide("npc")).toContain('faction: only a membership');
    expect(typeGuide("item")).toContain("kept_at (subject kept at target; subject_is_from true)");
  });

  it("every option the guide offers passes the check", () => {
    for (const pair of WORLD_LINK_PAIRS) {
      for (const subject of pair.from) {
        for (const target of pair.to) {
          for (const o of linkOptions(subject, target)) {
            const ctx: SuggestionContext = { subjectKind: subject, sourceName: "Subject", candidates: { [target]: ["Target"] }, existingLinks: [] };
            const out = sanitizeSuggestions([link(target, "Target", o.key, { subject_is_from: o.subjectIsFrom })], ctx);
            expect(out.suggestions, `${subject} ${o.key} ${target}`).toHaveLength(1);
          }
        }
      }
    }
  });
});

describe("sanitizeSuggestions links", () => {
  it("keeps a link in the candidate's casing, with the direction the pair implies", () => {
    const out = sanitize([
      link("deity", "the drowned lady", "worships", { notes: "Prays at the weir." }),
      link("location", "WEIR CHAPEL", "works_at"),
    ]);
    expect(out.suggestions).toEqual([
      { kind: "link", target_kind: "deity", target_name: "The Drowned Lady", type: "worships", subject_is_from: true, notes: "Prays at the weir." },
      { kind: "link", target_kind: "location", target_name: "Weir Chapel", type: "works_at", subject_is_from: true, notes: "" },
    ]);
  });

  it("reads a place's link backwards: the faction controls it", () => {
    const ctx: SuggestionContext = { subjectKind: "location", sourceName: "Weir Chapel", candidates: { faction: ["Dock Wardens"] }, existingLinks: [] };
    const out = sanitize([link("faction", "Dock Wardens", "controls")], ctx);
    expect(out.suggestions[0]).toMatchObject({ type: "controls", subject_is_from: false });
  });

  it("drops a type outside the pair, a wrong stated direction and an unknown type", () => {
    const out = sanitize([
      link("deity", "The Drowned Lady", "friend"),
      link("deity", "The Drowned Lady", "worships", { subject_is_from: false }),
      link("deity", "The Drowned Lady", "bestie"),
      { kind: "link", target_kind: "deity", target_name: "The Drowned Lady", notes: "" },
    ]);
    expect(out.suggestions).toEqual([]);
  });

  it("needs a stated direction when two people could hold the type either way", () => {
    expect(sanitize([link("npc", "Tilda Fenn", "mentor_of")]).suggestions).toEqual([]);
    const out = sanitize([link("npc", "Tilda Fenn", "mentor_of", { subject_is_from: false })]);
    expect(out.suggestions[0]).toMatchObject({ type: "mentor_of", subject_is_from: false });
  });

  it("stores a symmetric type from the subject whatever the model says", () => {
    const out = sanitize([link("npc", "Tilda Fenn", "rival", { subject_is_from: false })]);
    expect(out.suggestions).toEqual([]);
    expect(sanitize([link("npc", "Tilda Fenn", "rival")]).suggestions[0]).toMatchObject({ subject_is_from: true });
  });

  it("resolves a name found only under another kind", () => {
    const out = sanitize([link("location", "The Drowned Lady", "worships")]);
    expect(out.suggestions[0]).toMatchObject({ target_kind: "deity", target_name: "The Drowned Lady" });
  });

  it("drops unknown names, the subject itself and duplicates", () => {
    const out = sanitize([
      link("npc", "Nobody Real", "ally"),
      link("npc", "Mara Voss", "ally"),
      link("npc", "Tilda Fenn", "friend", { notes: "a" }),
      link("npc", "tilda fenn", "friend", { notes: "b" }),
      link("npc", "Tilda Fenn", "enemy", { notes: "c" }),
    ]);
    expect(out.suggestions.map((s) => s.kind === "link" && s.type)).toEqual(["friend", "enemy"]);
  });

  it("drops a tie that already exists, in the same direction", () => {
    expect(sanitize([link("npc", "Old Corwin", "friend")]).suggestions).toEqual([]);
    const ctx = { ...npcCtx, existingLinks: [{ kind: "npc" as const, name: "Old Corwin", type: "mentor_of", outward: true }] };
    expect(sanitize([link("npc", "Old Corwin", "mentor_of", { subject_is_from: true })], ctx).suggestions).toEqual([]);
    expect(sanitize([link("npc", "Old Corwin", "mentor_of", { subject_is_from: false })], ctx).suggestions).toHaveLength(1);
  });

  it("sets aside a symmetric tie that already exists the other way", () => {
    const ctx = { ...npcCtx, existingLinks: [{ kind: "npc" as const, name: "Old Corwin", type: "friend", outward: false }] };
    const out = sanitize([link("npc", "Old Corwin", "friend")], ctx);
    expect(out.suggestions).toEqual([]);
    expect(out.setAside).toEqual([
      { target_name: "Old Corwin", claim: "Mara Voss is friend of Old Corwin", reason: "Old Corwin is already friend of Mara Voss" },
    ]);
  });

  it("gives a faction one stance per side", () => {
    const ctx: SuggestionContext = {
      subjectKind: "faction",
      sourceName: "Toll-men",
      candidates: { faction: ["Dock Wardens", "Iron Concord"] },
      existingLinks: [{ kind: "faction", name: "Dock Wardens", type: "rival", outward: true }],
    };
    const out = sanitize([link("faction", "Dock Wardens", "hostile"), link("faction", "Iron Concord", "allied")], ctx);
    expect(out.suggestions.map((s) => s.target_name)).toEqual(["Iron Concord"]);
  });

  it("sets aside an item someone carries being kept or hidden somewhere", () => {
    const ctx: SuggestionContext = {
      subjectKind: "item",
      sourceName: "The Ferry Bell",
      candidates: { location: ["Weir Chapel", "Harl's Hut"] },
      existingLinks: [],
      itemCarriers: { "the ferry bell": "Brenna" },
    };
    const out = sanitize([link("location", "Weir Chapel", "kept_at"), link("location", "Harl's Hut", "hidden_at"), link("location", "Harl's Hut", "forged_at")], ctx);
    expect(out.suggestions.map((s) => s.kind === "link" && s.type)).toEqual(["forged_at"]);
    expect(out.setAside[0]).toEqual({ target_name: "Weir Chapel", claim: "The Ferry Bell is kept at Weir Chapel", reason: "Brenna carries it" });
  });

  it("applies the carried-item rule from the place's side too", () => {
    const ctx: SuggestionContext = {
      subjectKind: "location",
      sourceName: "Weir Chapel",
      candidates: { item: ["The Ferry Bell"] },
      existingLinks: [],
      itemCarriers: { "the ferry bell": "Brenna" },
    };
    const out = sanitize([link("item", "The Ferry Bell", "kept_at")], ctx);
    expect(out.suggestions).toEqual([]);
    expect(out.setAside[0].claim).toBe("The Ferry Bell is kept at Weir Chapel");
  });

  it("caps at twelve, truncates notes and tolerates junk", () => {
    const names = Array.from({ length: 20 }, (_, i) => `Person ${i}`);
    const many = sanitize(names.map((n) => link("npc", n, "ally")), { ...npcCtx, candidates: { npc: names } });
    expect(many.suggestions).toHaveLength(MAX_SUGGESTIONS);
    const out = sanitize(["junk", null, link("npc", "Tilda Fenn", "ally", { notes: "x".repeat(500) })]);
    expect(out.suggestions).toHaveLength(1);
    expect(out.suggestions[0].notes.length).toBeLessThanOrEqual(MAX_NOTES_CHARS);
    expect(sanitize("nope").suggestions).toEqual([]);
    expect(sanitize({ suggestions: "no" }).suggestions).toEqual([]);
  });
});

describe("sanitizeSuggestions notes", () => {
  it("keeps a note of exactly the limit and cuts one a character over, ending in an ellipsis", () => {
    const at = sanitize([link("npc", "Tilda Fenn", "ally", { notes: "x".repeat(MAX_NOTES_CHARS) })]);
    expect(at.suggestions[0].notes).toBe("x".repeat(MAX_NOTES_CHARS));
    const over = sanitize([link("npc", "Tilda Fenn", "ally", { notes: "x".repeat(MAX_NOTES_CHARS + 1) })]);
    expect(over.suggestions[0].notes).toBe(`${"x".repeat(MAX_NOTES_CHARS - 1)}…`);
  });
});

describe("sanitizeSuggestions memberships", () => {
  const membership = (target_name: string, role: string, extra: Record<string, unknown> = {}) => ({
    kind: "membership", target_name, role, notes: "", ...extra,
  });

  it("holds a faction role to the membership picker's roles", () => {
    const ctx = { ...npcCtx, existingMemberNames: [] };
    const out = sanitize([membership("THE IRON CONCORD", "secret MEMBER"), membership("Dock Wardens", "Envoy and Omen-Reader")], ctx);
    expect(out.suggestions.map((s) => s.kind === "membership" && [s.target_name, s.role])).toEqual([
      ["The Iron Concord", "Secret member"],
      ["Dock Wardens", "Associate"],
    ]);
    expect(out.suggestions[0]).toMatchObject({ target_kind: "faction" });
  });

  it("drops a faction the person already belongs to", () => {
    expect(sanitize([membership("Dock Wardens", "Member")]).suggestions).toEqual([]);
  });

  it("offers no second head to a faction that already has one", () => {
    const ctx = { ...npcCtx, existingMemberNames: [], headedFactionNames: ["the iron concord", "Dock Wardens"] };
    const out = sanitize([membership("The Iron Concord", "Leader"), membership("Dock Wardens", "Head of house"), membership("Dock Wardens", "Officer")], ctx);
    expect(out.suggestions).toEqual([{ kind: "membership", target_kind: "faction", target_name: "Dock Wardens", role: "Officer", notes: "" }]);
  });

  it("from a faction, names a person and holds the head rule to the faction itself", () => {
    const ctx: SuggestionContext = {
      subjectKind: "faction",
      sourceName: "Toll-men",
      candidates: { npc: ["Harl"], party_member: ["Tamsin"] },
      existingLinks: [],
      subjectHeaded: true,
    };
    const out = sanitize([membership("Harl", "Leader"), membership("Harl", "Officer"), membership("Tamsin", "Agent", { target_kind: "party_member" })], ctx);
    expect(out.suggestions.map((s) => s.kind === "membership" && [s.target_kind, s.target_name, s.role])).toEqual([
      ["npc", "Harl", "Officer"],
      ["party_member", "Tamsin", "Agent"],
    ]);
  });

  it("is refused for a subject that is neither a person nor a faction", () => {
    const ctx: SuggestionContext = { subjectKind: "item", sourceName: "The Ferry Bell", candidates: { faction: ["Dock Wardens"] }, existingLinks: [] };
    expect(sanitize([membership("Dock Wardens", "Member")], ctx).suggestions).toEqual([]);
  });
});

describe("sanitizeSuggestions kin", () => {
  const kinCtx: SuggestionContext = {
    subjectKind: "npc",
    sourceName: "Wren Ashe",
    candidates: { npc: ["Brenna Ashe", "Pip", "Corwin Ashe", "Dara Ashe", "Old Hob"], party_member: ["Tamsin"] },
    existingLinks: [],
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
    expect(out.setAside).toEqual([{ target_name: "Pip", claim: "Pip is Wren Ashe's parent", reason: "Pip was born five years after Wren Ashe" }]);
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
    expect(out.setAside).toEqual([{ target_name: "Dara Ashe", claim: "Dara Ashe is Wren Ashe's sibling", reason: "already siblings through Brenna Ashe" }]);
  });

  it("does not judge when a birth year is unknown", () => {
    const out = sanitizeSuggestions({ suggestions: [kin("Brenna Ashe", "parent")] }, { ...kinCtx, sourceBornYear: null });
    expect(out.suggestions).toHaveLength(1);
  });

  it("drops a character the subject is already kin with, as it does for an NPC", () => {
    const ctx = { ...kinCtx, existingKinPcNames: ["Tamsin"] };
    expect(sanitizeSuggestions([kin("Tamsin", "sibling", { target_type: "pc" })], ctx).suggestions).toEqual([]);
    expect(sanitizeSuggestions([kin("Tamsin", "sibling", { target_type: "pc" })], kinCtx).suggestions).toHaveLength(1);
  });

  it("keeps kin for a character subject and refuses it for a place", () => {
    const pc: SuggestionContext = { ...kinCtx, subjectKind: "party_member", sourceName: "Tamsin", candidates: { npc: ["Brenna Ashe"], party_member: ["Tamsin"] }, existingKinNpcNames: [], sourceBornYear: 1450 };
    expect(sanitizeSuggestions([kin("Brenna Ashe", "parent")], pc).suggestions).toHaveLength(1);
    expect(sanitizeSuggestions([kin("Tamsin", "sibling", { target_type: "pc" })], pc).suggestions).toEqual([]);
    const place: SuggestionContext = { ...kinCtx, subjectKind: "location" };
    expect(sanitizeSuggestions([kin("Brenna Ashe", "parent")], place).suggestions).toEqual([]);
  });
});

describe("withTargetIds", () => {
  it("attaches the id of the candidate each name resolved to, by kind, and drops what has none", () => {
    const out = withTargetIds(
      [
        { kind: "link", target_kind: "deity", target_name: "The Drowned Lady", type: "worships", subject_is_from: true, notes: "" },
        { kind: "membership", target_kind: "faction", target_name: "Dock Wardens", role: "Member", notes: "" },
        { kind: "kin", target_name: "Tamsin", target_type: "pc", relation: "sibling", parent_role: null, notes: "" },
        { kind: "kin", target_name: "Tamsin", target_type: "npc", relation: "sibling", parent_role: null, notes: "" },
      ],
      { deity: { "the drowned lady": "d1" }, faction: { "dock wardens": "f1" }, party_member: { tamsin: "p1" } },
    );
    expect(out.map((s) => s.target_id)).toEqual(["d1", "f1", "p1"]);
  });
});
