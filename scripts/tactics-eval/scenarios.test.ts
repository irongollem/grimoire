import { describe, expect, it } from "vitest";
import { prepare } from "./fixtures.ts";
import { SCENARIOS } from "./scenarios.ts";

describe("the tactics evaluation set", () => {
  it("gives every scenario its own id, so a result row names one situation", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("labels only turns that exist after the gate: a label naming a gated-out or misspelled turn can never be matched, and scores a picker 'neither' by default", () => {
    for (const s of SCENARIOS) {
      const ids = new Set(prepare(s.fight).options.map((o) => o.id));
      for (const id of [...s.good, ...s.bad]) expect(ids, `${s.id}: ${id}`).toContain(id);
    }
  });

  it("keeps good and bad apart: a turn in both lists would score the same pick two ways", () => {
    for (const s of SCENARIOS) expect(s.good.filter((id) => s.bad.includes(id)), s.id).toEqual([]);
  });

  it("names at least one good turn per scenario, since a set with no right answer measures nothing", () => {
    for (const s of SCENARIOS) expect(s.good.length, s.id).toBeGreaterThan(0);
  });

  it("covers every cleverness tier and every derived role, and puts a note on the creature in each note scenario", () => {
    const tags = new Set(SCENARIOS.flatMap((s) => s.tags));
    for (const t of ["instinct", "simple", "trained", "tactical", "brute", "skirmisher", "artillery", "controller", "lurker", "leader", "note", "multiattack", "morale-broken", "morale-holds"] as const) {
      expect(tags.has(t), t).toBe(true);
    }
    for (const s of SCENARIOS.filter((x) => x.tags.includes("note"))) expect(prepare(s.fight).profile.note, s.id).not.toBeNull();
  });

  it("tags exactly the creatures that have a note as 'note', so the note tables count the creatures the veto is asked about", () => {
    for (const s of SCENARIOS) expect(s.tags.includes("note"), s.id).toBe(prepare(s.fight).profile.note !== null);
  });

  it("tags each scenario with the tier and role its creature really has, so the per-tag table cannot lie", () => {
    for (const s of SCENARIOS) {
      const { profile } = prepare(s.fight);
      expect(s.tags, s.id).toContain(profile.tier);
      expect(s.tags, s.id).toContain(profile.role);
    }
  });
});
