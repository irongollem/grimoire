import { describe, expect, it } from "vitest";
import { NPC_TEMPLATES } from "./npcTemplates";

const LISTS = ["special_abilities", "actions", "bonus_actions", "reactions", "legendary_actions", "lair_actions"] as const;

describe("NPC_TEMPLATES", () => {
  it("structures every entry without a review", () => {
    const flagged: string[] = [];
    for (const t of NPC_TEMPLATES) {
      for (const list of LISTS) {
        for (const e of t.stat_block[list] ?? []) {
          if (e.structured.review) flagged.push(`${t.id}/${list}/${e.name}: ${e.structured.review}`);
        }
      }
    }
    expect(flagged).toEqual([]);
  });

  it("reads each weapon attack as an attack", () => {
    for (const t of NPC_TEMPLATES) {
      for (const e of t.stat_block.actions ?? []) {
        if (/Weapon Attack:/i.test(e.description)) {
          expect(e.structured.kind, `${t.id}/${e.name}`).toBe("attack");
        }
      }
    }
  });

  it("gives every template typed defenses", () => {
    for (const t of NPC_TEMPLATES) expect(t.stat_block.defenses.resistances).toBeDefined();
  });
});
