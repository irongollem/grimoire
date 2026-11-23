import { describe, expect, it } from "vitest";
import { peoplesLine, peoplesProblem, peoplesTotal, rollPeople } from "./peoples";

const world = [{ name: "Elf", percent: 80 }, { name: "Human", percent: 15 }];

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
    expect(rollPeople(world, () => 0.5)).toBe("Elf");
    expect(rollPeople(world, () => 0.9)).toBe("Human");
    expect(rollPeople(world, () => 0.97)).toBeNull();
  });

  // Bug caught: the boundary read as <= gave the earlier people one extra point of the roll.
  it("hands the exact edge to the next people", () => {
    expect(rollPeople(world, () => 0.8)).toBe("Human");
    expect(rollPeople(world, () => 0.95)).toBeNull();
  });

  it("lands within two points of the share over ten thousand rolls", () => {
    const random = seeded(1255);
    const counts = new Map<string | null, number>();
    for (let i = 0; i < 10_000; i++) {
      const who = rollPeople(world, random);
      counts.set(who, (counts.get(who) ?? 0) + 1);
    }
    expect(Math.abs((counts.get("Elf") ?? 0) / 100 - 80)).toBeLessThan(2);
    expect(Math.abs((counts.get("Human") ?? 0) / 100 - 15)).toBeLessThan(2);
    expect(Math.abs((counts.get(null) ?? 0) / 100 - 5)).toBeLessThan(2);
  });

  // Bug caught: a zero share still took the roll at its edge (a 0-width slot picked on a tie).
  it("never picks a people at zero percent", () => {
    const list = [{ name: "Orc", percent: 0 }, { name: "Elf", percent: 50 }];
    expect(rollPeople(list, () => 0)).toBe("Elf");
    const random = seeded(7);
    for (let i = 0; i < 2000; i++) expect(rollPeople(list, random)).not.toBe("Orc");
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

  // Bug caught: a duplicate compared case-sensitively, so "elf" and "Elf " reached the table and were refused there.
  it("names a duplicate whatever its case or spacing", () => {
    expect(peoplesProblem([{ name: "Elf", percent: 10 }, { name: " elf ", percent: 10 }])).toContain("listed twice");
  });

  // Bug caught: a total past 100 saved, and the database refused it with an error the DM never saw explained.
  it("names a total past 100, and accepts exactly 100", () => {
    expect(peoplesProblem([{ name: "Elf", percent: 80 }, { name: "Human", percent: 30 }])).toContain("110%");
    expect(peoplesProblem([{ name: "Elf", percent: 80 }, { name: "Human", percent: 20 }])).toBeNull();
  });

  it("names a blank name and a share outside 0 to 100", () => {
    expect(peoplesProblem([{ name: "  ", percent: 10 }])).toContain("needs a name");
    expect(peoplesProblem([{ name: "Elf", percent: -1 }])).toContain("between 0 and 100");
    expect(peoplesProblem([{ name: "Elf", percent: 101 }])).toContain("between 0 and 100");
  });
});

describe("peoplesTotal and peoplesLine", () => {
  // Bug caught: 0.1 + 0.2 style float noise showed as "Adds up to 30.000000000000004%".
  it("totals without float noise", () => {
    expect(peoplesTotal([{ name: "A", percent: 0.1 }, { name: "B", percent: 0.2 }])).toBe(0.3);
  });

  it("writes the shares largest first with the remainder as anyone else", () => {
    expect(peoplesLine([{ name: "Human", percent: 15 }, { name: "Elf", percent: 80 }])).toBe("Elf 80%, Human 15%, anyone else 5%");
    expect(peoplesLine([])).toBe("");
  });
});
