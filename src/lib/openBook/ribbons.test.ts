import { describe, expect, it } from "vitest";
import { MAX_RIBBONS, isMarked, keepKnown, readRibbons, ribbonStorageKey, toggleRibbon, writeRibbons, type Ribbon } from "./ribbons";

const r = (key: string, unit = 0): Ribbon => ({ key, unit, title: key });

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("toggleRibbon", () => {
  it("adds a ribbon", () => {
    expect(toggleRibbon([], r("a"))).toEqual([r("a")]);
  });

  it("lifts a ribbon that is already there", () => {
    expect(toggleRibbon([r("a"), r("b")], r("a"))).toEqual([r("b")]);
  });

  it("treats another spread of the same page as another ribbon", () => {
    expect(toggleRibbon([r("a", 0)], r("a", 1))).toHaveLength(2);
  });

  it("replaces the oldest when full", () => {
    const full = [r("a"), r("b"), r("c")];
    const next = toggleRibbon(full, r("d"));
    expect(next).toHaveLength(MAX_RIBBONS);
    expect(next.map((x) => x.key)).toEqual(["b", "c", "d"]);
  });

  it("knows what is marked", () => {
    expect(isMarked([r("a", 2)], "a", 2)).toBe(true);
    expect(isMarked([r("a", 2)], "a", 1)).toBe(false);
  });
});

describe("storage", () => {
  it("round-trips", () => {
    const storage = memoryStorage();
    expect(writeRibbons("salt", [r("a", 1)], storage)).toBe(true);
    expect(readRibbons("salt", storage)).toEqual([r("a", 1)]);
  });

  it("keeps books apart", () => {
    const storage = memoryStorage();
    writeRibbons("salt", [r("a")], storage);
    expect(readRibbons("other", storage)).toEqual([]);
  });

  it("works without storage", () => {
    expect(readRibbons("salt", null)).toEqual([]);
    expect(writeRibbons("salt", [r("a")], null)).toBe(false);
  });

  it("survives storage that throws", () => {
    const hostile = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(readRibbons("salt", hostile)).toEqual([]);
    expect(writeRibbons("salt", [r("a")], hostile)).toBe(false);
  });

  it("ignores corrupt or foreign values", () => {
    const key = ribbonStorageKey("salt");
    expect(readRibbons("salt", memoryStorage({ [key]: "{not json" }))).toEqual([]);
    expect(readRibbons("salt", memoryStorage({ [key]: '{"a":1}' }))).toEqual([]);
    expect(
      readRibbons("salt", memoryStorage({ [key]: JSON.stringify([
            r("ok"),
            { key: 3, unit: 0, title: "t" },
            { key: "x", unit: -1, title: "t" },
            { key: "", unit: 0, title: "t" },
            { key: "x", unit: 1.5, title: "t" },
            { key: "x", unit: 0, title: 7 },
          ]) })),
    ).toEqual([r("ok")]);
  });

  it("caps what it reads", () => {
    const many = [r("a"), r("b"), r("c"), r("d"), r("e")];
    const storage = memoryStorage({ [ribbonStorageKey("salt")]: JSON.stringify(many) });
    expect(readRibbons("salt", storage)).toHaveLength(MAX_RIBBONS);
  });
});

describe("keepKnown", () => {
  it("drops ribbons for pages that left the book", () => {
    expect(keepKnown([r("a"), r("gone")], new Set(["a"]))).toEqual([r("a")]);
  });
});
