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

  it("starts with monsters and ends with factions", () => {
    const ordered = listEntityKindsInWizardOrder();
    expect(ordered[0]?.kind).toBe("monsters");
    expect(ordered[ordered.length - 1]?.kind).toBe("factions");
  });
});
