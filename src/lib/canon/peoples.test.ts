import { describe, expect, it } from "vitest";
import { peoplesLine } from "@edge-shared/worldBlock.ts";
import { peoplesProblem, peoplesTotal, rollPeople, type People } from "./peoples";

const people = (name: string, percent: number, over: Partial<People> = {}): People => ({
  id: `p-${name}`, kind: "species", recordId: `lib_${name}`, fromLibrary: true, name, readable: true, percent, ...over,
});
const world = [people("Elf", 80), people("Human", 15)];

/** A small seeded generator (mulberry32), so the distribution test never flakes. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("rollPeople", () => {
  // Bug caught: a roll that ignores the shares (uniform pick, or always the first) breaks "80% elves generates elves 80% of the time".
  it("picks the people whose share the roll lands in, and nobody past the listed total", () => {
    expect(rollPeople(world, () => 0.5)?.name).toBe("Elf");
    expect(rollPeople(world, () => 0.9)?.name).toBe("Human");
    expect(rollPeople(world, () => 0.97)).toBeNull();
  });

  // Bug caught: the boundary read as <= gave the earlier people one extra point of the roll.
  it("hands the exact edge to the next people", () => {
    expect(rollPeople(world, () => 0.8)?.name).toBe("Human");
    expect(rollPeople(world, () => 0.95)).toBeNull();
  });

  it("lands within two points of the share over ten thousand rolls", () => {
    const random = seeded(1255);
    const counts = new Map<string | null, number>();
    for (let i = 0; i < 10_000; i++) {
      const who = rollPeople(world, random)?.name ?? null;
      counts.set(who, (counts.get(who) ?? 0) + 1);
    }
    expect(Math.abs((counts.get("Elf") ?? 0) / 100 - 80)).toBeLessThan(2);
    expect(Math.abs((counts.get("Human") ?? 0) / 100 - 15)).toBeLessThan(2);
    expect(Math.abs((counts.get(null) ?? 0) / 100 - 5)).toBeLessThan(2);
  });

  // Bug caught: a zero share still took the roll at its edge (a 0-width slot picked on a tie).
  it("never picks a people at zero percent", () => {
    const list = [people("Orc", 0), people("Elf", 50)];
    expect(rollPeople(list, () => 0)?.name).toBe("Elf");
    const random = seeded(7);
    for (let i = 0; i < 2000; i++) expect(rollPeople(list, random)?.name).not.toBe("Orc");
  });

  it("is null for an empty list", () => {
    expect(rollPeople([], () => 0)).toBeNull();
  });
});

describe("peoplesProblem", () => {
  it("is null for a list the table accepts, including one that sums below 100", () => {
    expect(peoplesProblem(world)).toBeNull();
    expect(peoplesProblem([])).toBeNull();
  });

  // Bug caught: a total past 100 saved, and the database refused it at commit with an error the DM never saw explained.
  it("names a total past 100, and accepts exactly 100", () => {
    expect(peoplesProblem([people("Elf", 80), people("Human", 30)])).toContain("110%");
    expect(peoplesProblem([people("Elf", 80), people("Human", 20)])).toBeNull();
    expect(peoplesProblem([people("Elf", 60), people("Human", 40.5)])).toContain("100.5%");
  });

  it("names a share outside 0 to 100, and a cleared field (NaN)", () => {
    expect(peoplesProblem([people("Elf", -1)])).toContain("between 0 and 100");
    expect(peoplesProblem([people("Elf", 101)])).toContain("between 0 and 100");
    expect(peoplesProblem([people("Elf", Number.NaN)])).toContain("between 0 and 100");
  });
});

describe("peoplesTotal and peoplesLine", () => {
  // Bug caught: 0.1 + 0.2 style float noise showed as "Adds up to 30.000000000000004%".
  it("totals without float noise", () => {
    expect(peoplesTotal([people("A", 0.1), people("B", 0.2)])).toBe(0.3);
  });

  it("writes the shares largest first with the remainder as anyone else", () => {
    expect(peoplesLine([people("Human", 15), people("Elf", 80)])).toBe("Elf 80%, Human 15%, anyone else 5%");
    expect(peoplesLine([])).toBe("");
  });
});

describe("a people this reader cannot name", () => {
  // Bug caught: a species on a co-DM's own shelf was rolled and its placeholder handed to the generator as a race,
  // or dropped from the total so the shares no longer added up.
  it("still counts toward the total but is never rolled: its share is anyone else", () => {
    const list = [people("A people another DM listed", 60, { readable: false }), people("Elf", 30)];
    expect(peoplesTotal(list)).toBe(90);
    expect(rollPeople(list, () => 0.3)).toBeNull();
    expect(rollPeople(list, () => 0.7)?.name).toBe("Elf");
  });
});
