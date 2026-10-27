import { describe, expect, it } from "vitest";
import { IMPORT_ENTITY_KINDS, type ImportEntityKind } from "@/types/documentImport.types";
import {
  ENTITY_KIND_REGISTRY,
  getEntityKindEntry,
  listEntityKindsInWizardOrder,
} from "./entityKinds";

describe("ENTITY_KIND_REGISTRY", () => {
  it("keys every entry under its own kind", () => {
    for (const kind of IMPORT_ENTITY_KINDS) {
      expect(ENTITY_KIND_REGISTRY[kind].kind).toBe(kind);
    }
  });

  it("gives quests a title-based heading and every other kind a name-based one", () => {
    const nonQuestKinds = IMPORT_ENTITY_KINDS.filter((kind) => kind !== "quests");

    expect(ENTITY_KIND_REGISTRY.quests.displayField).toBe("title");
    for (const kind of nonQuestKinds) {
      expect(ENTITY_KIND_REGISTRY[kind].displayField).toBe("name");
    }
  });

  it("marks exactly monsters, npcs, locations, quests, factions and encounters as quota-limited", () => {
    const quotaLimited: ImportEntityKind[] = ["monsters", "npcs", "locations", "quests", "factions", "encounters"];
    const unlimited: ImportEntityKind[] = ["items", "spells"];

    for (const kind of quotaLimited) {
      expect(ENTITY_KIND_REGISTRY[kind].quotaResource).toBe(kind);
    }
    for (const kind of unlimited) {
      // Explicitly null, not "" and not omitted — see the entry's doc comment.
      expect(ENTITY_KIND_REGISTRY[kind].quotaResource).toBeNull();
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
  it("returns all eight entries in the same order as IMPORT_ENTITY_KINDS", () => {
    const ordered = listEntityKindsInWizardOrder();
    expect(ordered.map((entry) => entry.kind)).toEqual([...IMPORT_ENTITY_KINDS]);
  });
});
