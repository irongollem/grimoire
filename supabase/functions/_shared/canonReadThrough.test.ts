import { describe, expect, it } from "vitest";
import { looseEnds, MAX_CONTRADICTIONS, sanitizeContradictions, type ReadEntry } from "./canonReadThrough";

const entry = (over: Partial<ReadEntry> & Pick<ReadEntry, "id" | "part">): ReadEntry => ({ title: over.id, revealed_at: null, closed_as: null, ...over });
const none = { clueSecretIds: [], steps: [], entryQuests: [] };

describe("looseEnds", () => {
  // Bug caught: a secret with a clue was reported (or one without was missed), so the list cried wolf or went quiet.
  it("reports an unrevealed secret with no clue, and not one that has a clue", () => {
    const out = looseEnds({ ...none, entries: [entry({ id: "s1", part: "secret" }), entry({ id: "s2", part: "secret" })], clueSecretIds: ["s2"] });
    expect(out).toEqual([{ kind: "loose_end", text: expect.stringContaining("s1"), entry_ids: ["s1"] }]);
  });

  // Bug caught: a revealed secret was flagged for having no clue, though the party already knows it.
  it("does not report a revealed secret", () => {
    expect(looseEnds({ ...none, entries: [entry({ id: "s1", part: "secret", revealed_at: "2026-11-01T00:00:00Z" })] })).toEqual([]);
  });

  // Bug caught: "no next step" counted a force whose steps are all reached as moving; it has nothing left to do.
  it("reports an open force with no step, or only reached steps, and not one with an unreached step", () => {
    const entries = [entry({ id: "f1", part: "force" }), entry({ id: "f2", part: "force" }), entry({ id: "f3", part: "force" })];
    const out = looseEnds({
      ...none,
      entries,
      steps: [{ force_id: "f2", reached_at: "2026-11-01T00:00:00Z" }, { force_id: "f3", reached_at: "2026-11-01T00:00:00Z" }, { force_id: "f3", reached_at: null }],
    });
    expect(out.map((f) => f.entry_ids)).toEqual([["f1"], ["f2"]]);
  });

  // Bug caught: an ended force or an answered question was reported, so finished work kept reappearing.
  it("never reports a closed force or question", () => {
    const entries = [entry({ id: "f1", part: "force", closed_as: "stopped" }), entry({ id: "q1", part: "question", closed_as: "answered" })];
    expect(looseEnds({ ...none, entries })).toEqual([]);
  });

  // Bug caught: a question tied to a quest was reported, or one tied to nothing was missed.
  it("reports an open question no quest is tied to", () => {
    const out = looseEnds({ ...none, entries: [entry({ id: "q1", part: "question" }), entry({ id: "q2", part: "question" })], entryQuests: [{ entry_id: "q2" }] });
    expect(out.map((f) => f.entry_ids)).toEqual([["q1"]]);
  });

  // Bug caught: a rule applied to the wrong part (a truth with no clue, lore with no quest) flooded the list.
  it("ignores parts with no loose-end rule", () => {
    const entries = ["truth", "lore", "premise", "backstory"].map((part, i) => entry({ id: `e${i}`, part }));
    expect(looseEnds({ ...none, entries })).toEqual([]);
  });
});

describe("sanitizeContradictions", () => {
  const known = new Set(["a", "b", "c"]);

  it("keeps a contradiction that names two real entries", () => {
    const out = sanitizeContradictions({ contradictions: [{ text: " The king is dead.  But he signs a decree. ", entry_ids: ["a", "b"] }] }, known);
    expect(out.findings).toEqual([{ kind: "contradiction", text: "The king is dead. But he signs a decree.", entry_ids: ["a", "b"] }]);
  });

  // Bug caught: a finding naming an entry of another campaign was shown, linking the DM to (or leaking) a foreign entry.
  it("drops a contradiction that names an entry the campaign does not have, and says so", () => {
    const out = sanitizeContradictions({ contradictions: [{ text: "Clash.", entry_ids: ["a", "other-campaign"] }, { text: "Real.", entry_ids: ["a", "c"] }] }, known);
    expect(out.findings.map((f) => f.text)).toEqual(["Real."]);
    expect(out.setAside).toEqual([{ claim: "Clash.", reason: expect.stringContaining("does not have") }]);
  });

  // Bug caught: "a contradiction" about one entry (or one id repeated) was listed; it is between entries.
  it("needs two distinct entries", () => {
    expect(sanitizeContradictions({ contradictions: [{ text: "x", entry_ids: ["a"] }, { text: "y", entry_ids: ["a", "a"] }] }, known).findings).toEqual([]);
  });

  // Bug caught: an unbounded model answer filled the screen.
  it("caps the findings and ignores a malformed answer", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ text: `c${i}`, entry_ids: ["a", "b"] }));
    expect(sanitizeContradictions({ contradictions: many }, known).findings).toHaveLength(MAX_CONTRADICTIONS);
    expect(sanitizeContradictions("nonsense", known)).toEqual({ findings: [], setAside: [] });
  });
});
