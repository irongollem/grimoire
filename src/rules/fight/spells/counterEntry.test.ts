import { describe, expect, it } from "vitest";
import { counterEntryFor } from "./counterEntry.ts";
import { counterspell, fireball, shield } from "./spellTestKit.ts";

describe("counterEntryFor", () => {
  // Bug caught: the counter read by its name instead of its data (a renamed homebrew copy would stop working, a Reaction with no counters would counter).
  it("fails if the record is not read from its `counters` effect and its Reaction casting time", () => {
    expect(counterEntryFor(counterspell())).toEqual({ rangeFeet: 60, ruleset: "2014" });
    expect(counterEntryFor(counterspell({ name: "Spell Snuffer", ruleset: "2024" }))).toEqual({ rangeFeet: 60, ruleset: "2024" });
    // Shield is a Reaction with no `counters`; Fireball carries no counters either.
    expect(counterEntryFor(shield())).toBeNull();
    expect(counterEntryFor(fireball())).toBeNull();
  });

  // Bug caught: a `counters` effect on an Action spell reacting (a counter cast as a turn's cast).
  it("fails if a record that is not cast as a Reaction counters", () => {
    expect(counterEntryFor(counterspell({ casting_time: "Action" }))).toBeNull();
  });

  // Bug caught: a record with a zero or missing reach countering everyone (or no one, reading NaN).
  it("fails if a counter with no range counters", () => {
    const record = counterspell();
    const effect = { ...(record.effects ?? [])[0], counters: { rangeFeet: 0 } };
    expect(counterEntryFor({ ...record, effects: [effect] })).toBeNull();
  });

  // Bug caught: a record with two counters (two reaches, nothing says which) countering by the first one.
  it("fails if a record carrying two counters is read as one", () => {
    const record = counterspell();
    const [effect] = record.effects ?? [];
    expect(counterEntryFor({ ...record, effects: [effect, { ...effect, id: "second", counters: { rangeFeet: 30 } }] })).toBeNull();
  });
});
