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

  it("gives quests and canon entries a title-based heading and every other kind a name-based one", () => {
    const nonTitleKinds = IMPORT_ENTITY_KINDS.filter((kind) => kind !== "quests" && kind !== "canon");

    expect(ENTITY_KIND_REGISTRY.quests.displayField).toBe("title");
    // A canon entry's heading is its title: a truth is one line, and the line is the title (canon_entries.title).
    expect(ENTITY_KIND_REGISTRY.canon.displayField).toBe("title");
    for (const kind of nonTitleKinds) {
      expect(ENTITY_KIND_REGISTRY[kind].displayField).toBe("name");
    }
  });

  it("marks exactly monsters, npcs, locations, quests, factions, deities and encounters as quota-limited", () => {
    const quotaLimited: ImportEntityKind[] = ["monsters", "npcs", "locations", "quests", "factions", "deities", "encounters"];
    // The canon has no cap of its own, and a deity import must name `deities` for check_quota.
    const unlimited: ImportEntityKind[] = ["items", "spells", "canon"];

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
  it("returns every entry in the same order as IMPORT_ENTITY_KINDS", () => {
    const ordered = listEntityKindsInWizardOrder();
    expect(ordered.map((entry) => entry.kind)).toEqual([...IMPORT_ENTITY_KINDS]);
  });
});
