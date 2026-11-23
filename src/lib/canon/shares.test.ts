import { describe, expect, it } from "vitest";
import { rollLife, type HabitatLife } from "./habitats";
import { sharesProblem, sharesRest, sharesTotal } from "./shares";

const creature = (name: string, percent: number, over: Partial<HabitatLife> = {}): HabitatLife => ({
  id: `l-${name}`, habitatId: "h1", recordId: `lib_${name}`, fromLibrary: true, name, readable: true, percent, ...over,
});

const share = (name: string, percent: number) => ({ name, percent });

describe("the share rules, one for the peoples and for a habitat's life", () => {
  it("accept a list that sums below 100 and an empty one", () => {
    expect(sharesProblem([share("Elf", 80), share("Human", 15)], "the whole")).toBeNull();
    expect(sharesProblem([], "the whole")).toBeNull();
  });

  // Bug caught: a total past 100 saved, and the database refused it at commit with an error the DM never saw explained.
  it("name a total past 100, and accept exactly 100", () => {
    expect(sharesProblem([share("Elf", 80), share("Human", 30)], "the whole")).toContain("110%");
    expect(sharesProblem([share("Elf", 80), share("Human", 20)], "the whole")).toBeNull();
    expect(sharesProblem([share("Elf", 60), share("Human", 40.5)], "the whole")).toContain("100.5%");
  });

  // Bug caught (#1255 item 31): the habitat kept its own copy of the rule and let 101% through while the peoples refused it.
  it("hold what lives in a habitat to the same 100", () => {
    expect(sharesProblem([creature("Eel", 60), creature("Frog", 41)], "everything that lives there")).toContain("101%");
  });

  it("name a share outside 0 to 100 and a cleared field (NaN)", () => {
    expect(sharesProblem([share("Elf", -1)], "the whole")).toContain("between 0 and 100");
    expect(sharesProblem([share("Elf", 101)], "the whole")).toContain("between 0 and 100");
    expect(sharesProblem([share("Elf", Number.NaN)], "the whole")).toContain("between 0 and 100");
  });

  // Bug caught: 0.1 + 0.2 style float noise showed as "Adds up to 30.000000000000004%".
  it("total and say what is left without float noise", () => {
    expect(sharesTotal([share("A", 0.1), share("B", 0.2)])).toBe(0.3);
    expect(sharesRest(60)).toBe(40);
    expect(sharesRest(0.1 + 0.2)).toBe(99.7);
  });
});

describe("rollLife", () => {
  const marsh = [creature("Eel", 40), creature("Frog", 20)];

  // Bug caught: a roll that ignores the shares (uniform pick) breaks "40% eels".
  it("picks the creature whose share the roll lands in, and nothing past the listed total", () => {
    expect(rollLife(marsh, () => 0.3)?.name).toBe("Eel");
    expect(rollLife(marsh, () => 0.5)?.name).toBe("Frog");
    expect(rollLife(marsh, () => 0.6)).toBeNull();
  });

  // Bug caught: a creature on a co-DM's own shelf was rolled and its placeholder name handed to a generator.
  it("never picks a creature this reader cannot name: its share is anything else", () => {
    const list = [creature("A creature another DM listed", 60, { readable: false }), creature("Frog", 30)];
    expect(rollLife(list, () => 0.3)).toBeNull();
    expect(rollLife(list, () => 0.7)?.name).toBe("Frog");
  });
});
