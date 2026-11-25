import { describe, expect, it } from "vitest";
import type { LooseEndsInput, LooseEntry } from "./canonLooseEnds";
import { looseEndFindings, MAX_CONTRADICTIONS, sanitizeContradictions } from "./canonReadThrough";

const entry = (over: Partial<LooseEntry> & Pick<LooseEntry, "id" | "part">): LooseEntry => ({
  title: over.id, created_at: "2026-01-01T00:00:00Z", revealed_at: null, closed_as: null, arc_id: null, party_member_id: null, loose_end_left_at: null, ...over,
});
const none: Omit<LooseEndsInput, "entries"> = { clues: [], steps: [], entryQuests: [], links: [], arcs: [], quests: [], sessions: [] };
const clueOf = (secret_id: string) => ({ secret_id, location_id: "loc", npc_id: null, quest_beat_id: null, item_id: null, document_id: null, passage_id: null });

describe("looseEndFindings", () => {
  // Bug caught: the read keeping its own thinner rule, so a secret with two clues (a loose end in Tonight) went unreported.
  it("reports by the shared rule: a secret with fewer than three clues, not one with three", () => {
    const entries = [entry({ id: "s1", part: "secret" }), entry({ id: "s2", part: "secret" })];
    const out = looseEndFindings({ ...none, entries, clues: [clueOf("s1"), clueOf("s1"), clueOf("s2"), clueOf("s2"), clueOf("s2")] });
    expect(out).toEqual([{ kind: "loose_end", text: expect.stringContaining("2 clues, fewer than 3"), entry_ids: ["s1"] }]);
  });

  // Bug caught: an entry the DM chose to leave still reported, so Leave it only worked on one of the two surfaces.
  it("skips an entry the DM left", () => {
    expect(looseEndFindings({ ...none, entries: [entry({ id: "s1", part: "secret", loose_end_left_at: "2026-11-25T00:00:00Z" })] })).toEqual([]);
  });

  // Bug caught: an open question no quest is tied to going unreported.
  it("reports an open question no quest is tied to", () => {
    const entries = [entry({ id: "q1", part: "question" }), entry({ id: "q2", part: "question" })];
    expect(looseEndFindings({ ...none, entries, entryQuests: [{ entry_id: "q2" }] }).map((f) => f.entry_ids)).toEqual([["q1"]]);
  });

  // Bug caught: an arc finding naming its own id as an entry, which the review would link to a canon entry that is not there.
  it("names no entry for an arc", () => {
    const out = looseEndFindings({ ...none, entries: [], arcs: [{ id: "a1", name: "The Bell", status: "running" }] });
    expect(out[0]?.entry_ids).toEqual([]);
    expect(out[0]?.text).toContain("The Bell");
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
