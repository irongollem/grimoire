import { describe, expect, it } from "vitest";
import { IMPORT_ENTITY_KINDS, type ImportEntityKind } from "@/types/documentImport.types";
import {
  ENTITY_KIND_REGISTRY,
  getEntityKindEntry,
  listEntityKindsInWizardOrder,
} from "./entityKinds";

describe("ENTITY_KIND_REGISTRY", () => {
  it("has exactly one entry per kind in IMPORT_ENTITY_KINDS, no more, no fewer", () => {
    expect(Object.keys(ENTITY_KIND_REGISTRY).sort()).toEqual([...IMPORT_ENTITY_KINDS].sort());
  });

  it("keys every entry under its own kind", () => {
    for (const kind of IMPORT_ENTITY_KINDS) {
      expect(ENTITY_KIND_REGISTRY[kind].kind).toBe(kind);
    }
  });

  it("is frozen — a caller cannot swap out a whole entry at runtime", () => {
    expect(Object.isFrozen(ENTITY_KIND_REGISTRY)).toBe(true);
  });

  it("targets the same-named table for all seven kinds", () => {
    for (const kind of IMPORT_ENTITY_KINDS) {
      expect(ENTITY_KIND_REGISTRY[kind].table).toBe(kind);
    }
  });

  it("gives quests a title-based heading and every other kind a name-based one", () => {
    const nonQuestKinds = IMPORT_ENTITY_KINDS.filter((kind) => kind !== "quests");

    expect(ENTITY_KIND_REGISTRY.quests.displayField).toBe("title");
    for (const kind of nonQuestKinds) {
      expect(ENTITY_KIND_REGISTRY[kind].displayField).toBe("name");
    }
  });

  it("marks exactly monsters, npcs, locations, quests and factions as quota-limited", () => {
    const quotaLimited: ImportEntityKind[] = ["monsters", "npcs", "locations", "quests", "factions"];
    const unlimited: ImportEntityKind[] = ["items", "spells"];

    for (const kind of quotaLimited) {
      expect(ENTITY_KIND_REGISTRY[kind].quotaResource).toBe(kind);
    }
    for (const kind of unlimited) {
      // Explicitly null, not "" and not omitted — see the entry's doc comment.
      expect(ENTITY_KIND_REGISTRY[kind].quotaResource).toBeNull();
    }
  });

  it("gives every entry non-empty singular and plural labels", () => {
    for (const kind of IMPORT_ENTITY_KINDS) {
      const entry = ENTITY_KIND_REGISTRY[kind];
      expect(entry.labelSingular.length).toBeGreaterThan(0);
      expect(entry.labelPlural.length).toBeGreaterThan(0);
    }
  });
});

describe("getEntityKindEntry", () => {
  it("returns the matching registry entry for every kind", () => {
    for (const kind of IMPORT_ENTITY_KINDS) {
      expect(getEntityKindEntry(kind)).toBe(ENTITY_KIND_REGISTRY[kind]);
    }
  });
});

describe("listEntityKindsInWizardOrder", () => {
  it("returns all seven entries in the same order as IMPORT_ENTITY_KINDS", () => {
    const ordered = listEntityKindsInWizardOrder();
    expect(ordered.map((entry) => entry.kind)).toEqual([...IMPORT_ENTITY_KINDS]);
  });

  // Deliberately NOT asserting which kind is first or last. An earlier version
  // of this test pinned "starts with monsters, ends with factions", which read
  // as a harmless description of the list and was in fact encoding a bug:
  // factions last meant an NPC's `faction_name` link could never resolve,
  // because factions did not exist yet when the NPC step ran. A test that
  // restates the array teaches nothing and defends the wrong thing.
  //
  // The property that actually matters — every kind imported after the kinds
  // its links point at — is asserted in `dependencyOrder.test.ts`.
  it("exposes the registry in exactly the order the wizard will walk", () => {
    const ordered = listEntityKindsInWizardOrder();
    expect(ordered).toHaveLength(IMPORT_ENTITY_KINDS.length);
    expect(new Set(ordered.map((entry) => entry.kind))).toEqual(new Set(IMPORT_ENTITY_KINDS));
  });
});
