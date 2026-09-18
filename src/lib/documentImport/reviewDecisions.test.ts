import { describe, expect, it } from "vitest";
import {
  ignoreAllDecisions,
  needsDmChoice,
  quotaShortfalls,
  rowsAddedToQuota,
  resetToSuggestedDecisions,
  seedImportDecisions,
  tallyDecisions,
} from "./reviewDecisions";
import type { EntityCandidate, ImportDecision } from "./entityMatching";
import type { UsableEntity } from "./sanitizeEntities";
import type { ImportEntityKind } from "@/types/documentImport.types";

function candidate(overrides: Partial<EntityCandidate> = {}): EntityCandidate {
  return { targetId: "id-1", source: "campaign", name: "Goblin", matchKind: "exact", detail: null, distance: null, ...overrides };
}

function entity(ref: string, data: Record<string, unknown> = { name: "Goblin" }): UsableEntity {
  return { ref, page: 1, confidence: "complete", data };
}

describe("seedImportDecisions", () => {
  it("seeds a default decision for every entity with none yet", () => {
    const entities = [entity("a"), entity("b")];
    const seeded = seedImportDecisions("npcs", entities, new Map(), new Map());
    expect(seeded.get("a")).toEqual({ action: "create" });
    expect(seeded.get("b")).toEqual({ action: "create" });
  });

  it("seeds link when a candidate exists", () => {
    const entities = [entity("a")];
    const candidatesByRef = new Map([["a", [candidate()]]]);
    const seeded = seedImportDecisions("npcs", entities, candidatesByRef, new Map());
    expect(seeded.get("a")).toEqual({ action: "link", candidate: candidate() });
  });

  it("never overwrites a decision the DM already made", () => {
    const entities = [entity("a")];
    const candidatesByRef = new Map([["a", [candidate()]]]);
    const existing = new Map<string, ImportDecision>([["a", { action: "ignore" }]]);
    const seeded = seedImportDecisions("npcs", entities, candidatesByRef, existing);
    expect(seeded.get("a")).toEqual({ action: "ignore" });
  });

  it("returns the same map instance when nothing needed seeding", () => {
    const entities = [entity("a")];
    const existing = new Map<string, ImportDecision>([["a", { action: "create" }]]);
    const seeded = seedImportDecisions("npcs", entities, new Map(), existing);
    expect(seeded).toBe(existing);
  });
});

describe("tallyDecisions", () => {
  it("counts each action bucket", () => {
    const decisions = new Map<string, ImportDecision>([
      ["a", { action: "link", candidate: candidate() }],
      ["b", { action: "create" }],
      ["c", { action: "create" }],
      ["d", { action: "generate" }],
      ["e", { action: "ignore" }],
    ]);
    expect(tallyDecisions(["a", "b", "c", "d", "e"], decisions)).toEqual({
      link: 1, adopt: 0, create: 2, generate: 1, ignore: 1,
    });
  });

  it("counts a link to a library candidate as `adopt`, not `link`", () => {
    const decisions = new Map<string, ImportDecision>([
      ["a", { action: "link", candidate: candidate({ source: "campaign" }) }],
      ["b", { action: "link", candidate: candidate({ source: "library" }) }],
    ]);
    expect(tallyDecisions(["a", "b"], decisions)).toEqual({
      link: 1, adopt: 1, create: 0, generate: 0, ignore: 0,
    });
  });

  it("does not count a ref with no decision yet", () => {
    expect(tallyDecisions(["a"], new Map())).toEqual({ link: 0, adopt: 0, create: 0, generate: 0, ignore: 0 });
  });
});

describe("needsDmChoice", () => {
  it("is false with no candidate, or a single same-name one", () => {
    expect(needsDmChoice([])).toBe(false);
    expect(needsDmChoice([candidate()])).toBe(false);
  });

  it("is true for more than one candidate", () => {
    expect(needsDmChoice([candidate(), candidate({ targetId: "id-2" })])).toBe(true);
  });

  it("is true for a single partial-name or similar match — a guess, not a fact", () => {
    expect(needsDmChoice([candidate({ name: "Wraith", matchKind: "contains" })])).toBe(true);
    expect(needsDmChoice([candidate({ matchKind: "similar", distance: 0.1 })])).toBe(true);
  });
});

describe("ignoreAllDecisions", () => {
  it("ignores every entity regardless of prior decisions", () => {
    const entities = [entity("a"), entity("b")];
    const result = ignoreAllDecisions(entities);
    expect(result.get("a")).toEqual({ action: "ignore" });
    expect(result.get("b")).toEqual({ action: "ignore" });
  });
});

describe("resetToSuggestedDecisions", () => {
  it("recomputes the default decision from current (edited) data, discarding prior choices", () => {
    const entities = [entity("a", { name: "Owlbear" })];
    const edited = new Map([["a", { name: "Owlbear", stat_block: { armor_class: 13 } }]]);
    const result = resetToSuggestedDecisions("monsters", entities, new Map(), edited);
    // A monster with a real stat block in its edited data defaults to create,
    // even though the un-edited page data (used only as a fallback) had none.
    expect(result.get("a")).toEqual({ action: "create" });
  });

  it("falls back to the entity's own data when nothing was edited", () => {
    const entities = [entity("a", { name: "Owlbear" })];
    const result = resetToSuggestedDecisions("monsters", entities, new Map(), new Map());
    // No stat block anywhere -> generate, not a blank create.
    expect(result.get("a")).toEqual({ action: "generate" });
  });
});

describe("plan limits", () => {
  const tally = { link: 1, adopt: 2, create: 3, generate: 1, ignore: 4 };

  it("counts creates and generations, and adopted copies only for monsters", () => {
    expect(rowsAddedToQuota("monsters", tally)).toBe(6);
    expect(rowsAddedToQuota("items", tally)).toBe(4);
    expect(rowsAddedToQuota("npcs", { ...tally, adopt: 0 })).toBe(4);
  });

  it("reports only kinds that would outrun their room, and never an unlimited one", () => {
    const room: Partial<Record<ImportEntityKind, number | null>> = { npcs: 2, locations: 10, monsters: null };
    const shortfalls = quotaShortfalls({ npcs: 6, locations: 6, monsters: 40 }, (kind) => room[kind] ?? null);
    expect(shortfalls).toEqual([{ kind: "npcs", wouldAdd: 6, room: 2 }]);
  });

  it("treats exactly filling the room as fine", () => {
    expect(quotaShortfalls({ npcs: 2 }, () => 2)).toEqual([]);
  });
});
