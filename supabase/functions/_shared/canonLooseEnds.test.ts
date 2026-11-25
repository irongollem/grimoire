import { describe, expect, it } from "vitest";
import { looseEnds, type LooseEndsInput, type LooseEntry } from "./canonLooseEnds";

const entry = (over: Partial<LooseEntry> & Pick<LooseEntry, "id" | "part">): LooseEntry => ({
  title: over.id, created_at: "2026-01-01T00:00:00Z", revealed_at: null, closed_as: null, arc_id: null, party_member_id: null, loose_end_left_at: null, ...over,
});
const base: LooseEndsInput = { entries: [], clues: [], steps: [], entryQuests: [], links: [], arcs: [], quests: [], sessions: [] };

describe("looseEnds (the one rule)", () => {
  // Bug caught: a backstory tied to an answered question counted as having an open thread.
  it("counts a backstory's thread only while the question is open, from either end of the link", () => {
    const back = entry({ id: "B", part: "backstory" });
    const q = entry({ id: "Q", part: "question" });
    const tie = { from_kind: "canon", from_id: "Q", to_kind: "canon", to_id: "B", type: "led_to" };
    expect(looseEnds({ ...base, entries: [back, q], entryQuests: [{ entry_id: "Q" }], links: [tie] })).toEqual([]);
    const closed = { ...q, closed_as: "answered" };
    expect(looseEnds({ ...base, entries: [back, closed], links: [tie] }).map((e) => e.key)).toEqual(["backstory:B"]);
  });

  // Bug caught: a link of another type (a known_to) read as a thread.
  it("ignores links that are not thread links", () => {
    const back = entry({ id: "B", part: "backstory" });
    const q = entry({ id: "Q", part: "question" });
    const tie = { from_kind: "canon", from_id: "B", to_kind: "canon", to_id: "Q", type: "known_to" };
    expect(looseEnds({ ...base, entries: [back, q], entryQuests: [{ entry_id: "Q" }], links: [tie] }).map((e) => e.key)).toEqual(["backstory:B"]);
  });

  // Bug caught: Leave it honoured for secrets only.
  it("skips every kind of entry the DM left", () => {
    const left = "2026-11-25T00:00:00Z";
    const entries = ["secret", "force", "question", "backstory"].map((part) => entry({ id: part, part, loose_end_left_at: left }));
    expect(looseEnds({ ...base, entries })).toEqual([]);
  });

  // Bug caught: a running arc the DM means to wait nagged for ever, because only entries could be left.
  it("skips a running arc the DM left, and still flags one they did not", () => {
    const arcs = [
      { id: "A", name: "Waiting", status: "running", loose_end_left_at: "2026-11-25T00:00:00Z" },
      { id: "B", name: "Stalled", status: "running", loose_end_left_at: null },
    ];
    expect(looseEnds({ ...base, arcs }).map((e) => e.key)).toEqual(["arc:B"]);
  });
});
