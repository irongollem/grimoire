import { describe, it, expect, vi, afterEach } from "vitest";
import { rollOnTable } from "./rollTableRoll";
import { ROLL_TABLE_DICE, ROLL_TABLE_DIE_MAX, type RollTable, type RollTableEntry } from "@/types/rollTable.types";

// ── Randomness control ──────────────────────────────────────────────────────
//
// rollOnTable delegates to rollDice({ [size]: 1 }, 0) (mode defaults to
// "normal"), which — for a single die and normal mode — always takes the
// simple rollDie(sides) path (the advantage/disadvantage special-case in
// dice.ts's rollDice only triggers when mode !== "normal"). So exactly one
// Math.random() call happens per rollOnTable call:
//   rollDie(sides) = Math.floor(Math.random() * sides) + 1
//
// randAt(roll, sides) returns the smallest Math.random() value that makes
// rollDie(sides) produce exactly `roll` — exact, no floating-point slop,
// since the numerator is always an integer strictly less than sides.

function randAt(roll: number, sides: number): number {
  return (roll - 1) / sides;
}

function stubRandom(values: number[]): void {
  let i = 0;
  vi.spyOn(Math, "random").mockImplementation(() => {
    if (i >= values.length) {
      throw new Error(`Math.random() called more times than the ${values.length} stubbed value(s)`);
    }
    return values[i++];
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<RollTableEntry> = {}): RollTableEntry {
  return {
    id: "entry-default",
    min: 1,
    max: 1,
    label: "Default Entry",
    ...overrides,
  };
}

function makeTable(overrides: Partial<RollTable> = {}): RollTable {
  return {
    id: "table-1",
    user_id: "user-1",
    campaign_id: null,
    name: "Test Table",
    description: null,
    dice: "1d6",
    entries: [],
    tags: [],
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ── Core matching behaviour ──────────────────────────────────────────────────

describe("rollOnTable", () => {
  it("returns the matching entry when the rolled value lands inside its [min, max] range", () => {
    const entryA = makeEntry({ id: "a", min: 1, max: 2, label: "Goblins" });
    const entryB = makeEntry({ id: "b", min: 3, max: 4, label: "Ogre" });
    const table = makeTable({ dice: "1d6", entries: [entryA, entryB] });
    stubRandom([randAt(3, 6)]);
    const result = rollOnTable(table);
    expect(result.rolled).toBe(3);
    expect(result.entry).toEqual(entryB);
  });

  it("returns entry: null when the rolled value lands in a gap between entries", () => {
    const entryA = makeEntry({ id: "a", min: 1, max: 2, label: "Goblins" });
    const entryB = makeEntry({ id: "b", min: 5, max: 6, label: "Ogre" });
    const table = makeTable({ dice: "1d6", entries: [entryA, entryB] });
    stubRandom([randAt(4, 6)]); // 3–4 is a deliberate gap — "no encounter"
    const result = rollOnTable(table);
    expect(result.rolled).toBe(4);
    expect(result.entry).toBeNull();
  });

  it("matches the first entry at the low boundary (rolled === min)", () => {
    const entryA = makeEntry({ id: "a", min: 1, max: 2, label: "Goblins" });
    const entryB = makeEntry({ id: "b", min: 3, max: 6, label: "Ogre" });
    const table = makeTable({ dice: "1d6", entries: [entryA, entryB] });
    stubRandom([randAt(1, 6)]);
    const result = rollOnTable(table);
    expect(result.rolled).toBe(1);
    expect(result.entry).toEqual(entryA);
  });

  it("matches the last entry at the high boundary (rolled === max)", () => {
    const entryA = makeEntry({ id: "a", min: 1, max: 2, label: "Goblins" });
    const entryB = makeEntry({ id: "b", min: 3, max: 6, label: "Ogre" });
    const table = makeTable({ dice: "1d6", entries: [entryA, entryB] });
    stubRandom([randAt(6, 6)]);
    const result = rollOnTable(table);
    expect(result.rolled).toBe(6);
    expect(result.entry).toEqual(entryB);
  });

  it("returns entry: null for an empty entries list, without ever touching min/max", () => {
    const table = makeTable({ dice: "1d20", entries: [] });
    stubRandom([randAt(11, 20)]);
    const result = rollOnTable(table);
    expect(result.rolled).toBe(11);
    expect(result.entry).toBeNull();
  });
});

// ── DIE_TO_SIZE / ROLL_TABLE_DIE_MAX mapping, per die ────────────────────────

describe("rollOnTable — die-size mapping", () => {
  it.each(ROLL_TABLE_DICE)("rolls within [1, max] and maps the full range correctly for %s", (die) => {
    const max = ROLL_TABLE_DIE_MAX[die];
    const entry = makeEntry({ id: "full-range", min: 1, max, label: "Covers everything" });
    const table = makeTable({ dice: die, entries: [entry] });

    // Queue both the lowest and highest possible rolls on this die up front —
    // stubRandom installs a single spy, so re-stubbing mid-test would try to
    // spy an already-spied Math.random.
    stubRandom([randAt(1, max), randAt(max, max)]);

    const low = rollOnTable(table);
    expect(low.rolled).toBe(1);
    expect(low.entry).toEqual(entry);

    const high = rollOnTable(table);
    expect(high.rolled).toBe(max);
    expect(high.entry).toEqual(entry);
  });
});
