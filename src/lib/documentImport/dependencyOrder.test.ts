import { describe, expect, it } from "vitest";
import { IMPORT_ENTITY_KINDS, type ImportEntityKind } from "@/types/documentImport.types";

/**
 * `IMPORT_ENTITY_KINDS` is a dependency order, and nothing enforced that.
 *
 * The wizard imports one kind per step and resolves each kind's cross-entity
 * links immediately afterwards, against rows that exist *at that moment*. So a
 * kind must be imported after everything its links point at. The original order
 * put `factions` last while `npcs` — second — carries a `faction_name` link, so
 * that link could never resolve. It did not throw, did not warn, and did not
 * fail a single one of the 3,800 tests: the link was silently dropped every
 * time. It surfaced only by importing a real document and noticing the
 * `faction_npcs` join row that should have been written was absent.
 *
 * These assertions are the guard. The map below is the declared dependency
 * graph — keep it in step with the link fields on the `Extracted*` payloads in
 * `documentImport.types.ts` and with `EntityLinks` in `normalize.ts`. Adding a
 * link to a payload without reordering `IMPORT_ENTITY_KINDS` fails here rather
 * than silently losing data in production.
 */
const LINK_DEPENDENCIES: Readonly<Record<ImportEntityKind, readonly ImportEntityKind[]>> = {
  // `ExtractedNpc.faction_name` → an imported faction.
  npcs: ["factions"],
  // `ExtractedQuest.giver_npc_name` / `location_name`.
  quests: ["npcs", "locations"],
  // `ExtractedLocation.parent_name` points at another location, resolved inside
  // the same step once the whole kind is inserted — so it depends on itself and
  // needs no ordering guarantee against another kind.
  locations: [],
  factions: [],
  monsters: [],
  items: [],
  spells: [],
};

describe("IMPORT_ENTITY_KINDS dependency order", () => {
  it("imports every kind after the kinds its links point at", () => {
    const position = new Map<ImportEntityKind, number>(
      IMPORT_ENTITY_KINDS.map((kind, index) => [kind, index]),
    );

    for (const [kind, dependencies] of Object.entries(LINK_DEPENDENCIES)) {
      for (const dependency of dependencies) {
        expect(
          position.get(dependency as ImportEntityKind)!,
          `${kind} links to ${dependency}, so ${dependency} must be imported first`,
        ).toBeLessThan(position.get(kind as ImportEntityKind)!);
      }
    }
  });

  it("declares a dependency entry for every kind", () => {
    // Otherwise a newly added kind carrying a link silently escapes the check
    // above — the same shape of gap as the bug this file exists for.
    expect(Object.keys(LINK_DEPENDENCIES).sort()).toEqual([...IMPORT_ENTITY_KINDS].sort());
  });

  it("puts factions before npcs specifically", () => {
    // Named on its own because this is the pairing that was actually wrong, and
    // a future reordering "for readability" would reintroduce it.
    const kinds: readonly string[] = IMPORT_ENTITY_KINDS;
    expect(kinds.indexOf("factions")).toBeLessThan(kinds.indexOf("npcs"));
  });
});
