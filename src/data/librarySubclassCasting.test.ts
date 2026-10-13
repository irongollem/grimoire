import { describe, expect, it } from "vitest";
import identities from "../../scripts/data/library-subclass-identities.json";
import { LIBRARY_SUBCLASS_CASTING } from "@/data/librarySubclassCasting";

describe("librarySubclassCasting", () => {
  it("names library subclasses of classes that do not cast, once each", () => {
    const known = new Map(identities.map(i => [`${i.source_document_key}::${i.source_record_key}::${i.ruleset}`, i.class_name]));
    const seen = new Set<string>();
    for (const e of LIBRARY_SUBCLASS_CASTING) {
      const key = `${e.source_document_key}::${e.source_record_key}::${e.ruleset}`;
      expect(known.has(key), key).toBe(true);
      expect(["Fighter", "Rogue"]).toContain(known.get(key));
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it("holds 20 rows per table, nothing before class level 3, and never a slot without a known spell", () => {
    for (const { source_record_key: key, spellcasting: c } of LIBRARY_SUBCLASS_CASTING) {
      expect(c.spell_slots, key).toHaveLength(20);
      expect(c.spells_known, key).toHaveLength(20);
      expect(c.cantrips_known, key).toHaveLength(20);
      expect(c.spell_slots[1].every(n => n === 0), key).toBe(true);
      expect(c.spell_slots[2][0], key).toBe(2);
      c.spell_slots.forEach((row, i) => {
        if (row.some(n => n > 0)) expect(c.spells_known[i], `${key} L${i + 1}`).toBeGreaterThan(0);
      });
    }
  });
});
