import { describe, expect, it } from "vitest";
import type { MonsterStatBlock } from "@/types/monster.types";
import { temperLine, temperOf } from "./temper";

const block = (over: Partial<MonsterStatBlock> = {}): MonsterStatBlock =>
  ({ int: 10, languages: "Common", defenses: { resistances: [], immunities: [], vulnerabilities: [], condition_immunities: [] }, actions: [], ...over }) as unknown as MonsterStatBlock;

describe("temperOf", () => {
  // Bug caught live (17 Nov 2026): a spun-glass construct talked into standing down with a Persuasion check.
  it("puts a construct beyond words and beyond giving in, whatever it understands", () => {
    const t = temperOf(block({ int: 6, languages: "understands the languages of its creator but can't speak" }), "construct");
    expect(t.reached).toBe("none");
    expect(t.yields).toBe(false);
  });

  // The mindless dead obey; the dead with a will can be bargained with. Both are fearless by the morale rule.
  it("tells a zombie from a wight by its Intelligence", () => {
    expect(temperOf(block({ int: 5 }), "undead").reached).toBe("none");
    expect(temperOf(block({ int: 6 }), "undead").reached).toBe("words");
    expect(temperOf(block({ int: 6 }), "undead").yields).toBe(false);
  });

  // Bug caught: a wolf argued with (Persuasion) instead of handled; maintainer: "persuasion instead of animal handling?"
  it("reaches a creature of animal wits, or one with no language, by handling", () => {
    expect(temperOf(block({ int: 3, languages: "—" }), "beast").reached).toBe("handling");
    expect(temperOf(block({ int: 3, languages: "Common" }), "beast").reached).toBe("handling");
    expect(temperOf(block({ int: 8, languages: "" }), "monstrosity").reached).toBe("handling");
    expect(temperOf(block({ int: 4, languages: "Goblin" }), "humanoid").reached).toBe("words");
  });

  it("reads fear and charm from the stat block's condition immunities", () => {
    const immune = block({ defenses: { resistances: [], immunities: [], vulnerabilities: [], condition_immunities: ["Frightened", "Charmed"] } } as Partial<MonsterStatBlock>);
    expect(temperOf(immune, "elemental")).toMatchObject({ frightened: false, charmed: false });
    expect(temperOf(block(), "humanoid")).toMatchObject({ frightened: true, charmed: true });
  });

  // A DM's own morale on the creature wins over the type's default.
  it("lets a construct the DM gave a breaking point give in", () => {
    // oxlint-disable-next-line unicorn/no-thenable -- `then` is the stat block's own morale field
    const t = temperOf(block({ tactics: { morale: { breaksAt: 0.5, then: "surrender" } } } as Partial<MonsterStatBlock>), "construct");
    expect(t.yields).toBe(true);
  });
});

describe("pursuit", () => {
  // App convention (the books leave a chase to the DM). Bug caught: a guardian construct leaving its post to hunt
  // the player through the house; a wolf or a zombie standing still while its prey walks away; a thinking foe
  // given no choice in it.
  it("keeps what was made to keep a place at it, sends the mindless dead and beasts after what runs, and leaves the rest to judge", () => {
    expect(temperOf(block({ int: 6 }), "construct").pursuit).toBe("stays");
    expect(temperOf(block({ int: 1, languages: "—" }), "ooze").pursuit).toBe("stays");
    expect(temperOf(block({ int: 3 }), "undead").pursuit).toBe("hunts");
    expect(temperOf(block({ int: 3, languages: "—" }), "beast").pursuit).toBe("hunts");
    expect(temperOf(block({ int: 10, languages: "Common" }), "humanoid").pursuit).toBe("judges");
    expect(temperOf(block({ int: 12, languages: "Common" }), "undead").pursuit).toBe("judges");
  });
});

describe("temperLine", () => {
  it("says it in a line", () => {
    expect(temperLine({ kind: "construct", reached: "none", frightened: false, charmed: false, yields: false, pursuit: "stays" })).toBe(
      "construct; words do not move it: it does what it was made to do; cannot be frightened; cannot be charmed; never gives in or flees; does not leave its place to give chase",
    );
  });
});
