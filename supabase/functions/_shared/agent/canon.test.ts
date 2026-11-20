import { describe, expect, it } from "vitest";
import {
  canonHereSection,
  capCanonHere,
  CANON_LIST_MAX,
  chronicleExcerpt,
  latestChronicle,
  LOOKUP_HITS_MAX,
  LOOKUP_PARTS,
  lookupAnswer,
  makeBringOutTool,
  NO_CANON_HERE,
  previouslySection,
  readableMatches,
  type BroughtOut,
  type CanonHere,
  type CanonMatch,
} from "./canon";

const CLUE = "00000000-0000-4000-8000-0000000000c1";
const PASSAGE = "00000000-0000-4000-8000-0000000000d1";
const OTHER = "00000000-0000-4000-8000-0000000000e1";

const here: CanonHere = {
  clues: [{ id: CLUE, secretId: "00000000-0000-4000-8000-0000000000f1", line: "A ledger page, water-stained, is pinned under the lamp." }],
  passages: [{ id: PASSAGE, title: "The drowned bell", text: "The bell rang once when the river took the chapel." }],
  knows: [{ who: ["Miss Pellam"], truth: "the river gives things back" }],
  questions: ["Who made the Stain?"],
  forces: [{ title: "The Gilt Hand", step: "They bought the ferry" }],
};

describe("canonHereSection", () => {
  it("is empty when the canon has nothing to say here", () => {
    expect(canonHereSection(NO_CANON_HERE)).toBe("");
  });

  it("tells the Narrator to hint at a clue and never state what it points to, and gives the clue's line and id", () => {
    const text = canonHereSection(here);
    expect(text).toContain("hint at them through the scene, never state what they point to");
    expect(text).toContain(`${CLUE}: A ledger page`);
  });

  it("says who may say a truth only some know, as the frame does", () => {
    expect(canonHereSection(here)).toContain("Miss Pellam may say: the river gives things back");
  });

  it("lists the open questions as kept open and the forces with their latest step", () => {
    const text = canonHereSection(here);
    expect(text).toContain("Kept open: nobody settles these");
    expect(text).toContain("- Who made the Stain?");
    expect(text).toContain("- The Gilt Hand: They bought the ferry");
  });

  it("never carries the secret a clue points at: a clue's secret id is not worded", () => {
    expect(canonHereSection(here)).not.toContain(here.clues[0].secretId);
  });
});

describe("capCanonHere", () => {
  it("cuts every list to its ceiling, so the section stays short", () => {
    const many = Array.from({ length: CANON_LIST_MAX + 5 }, (_, i) => ({ id: `id${i}`, secretId: "s", line: `Clue ${i}` }));
    expect(capCanonHere({ ...here, clues: many }).clues).toHaveLength(CANON_LIST_MAX);
  });

  it("flattens and cuts a passage's text", () => {
    const long = { id: PASSAGE, title: "T", text: "word ".repeat(400) };
    expect(capCanonHere({ ...here, passages: [long] }).passages[0].text.length).toBeLessThanOrEqual(500);
  });
});

describe("makeBringOutTool", () => {
  const tool = () => {
    const brought: BroughtOut[] = [];
    return { brought, bound: makeBringOutTool({ offered: () => here, onBroughtOut: (b) => brought.push(b) }) };
  };

  it("marks a clue that was offered this turn", async () => {
    const { brought, bound } = tool();
    expect((await bound.call({ clue_id: CLUE })).isError).toBe(false);
    expect(brought).toEqual([{ kind: "clue", id: CLUE }]);
  });

  it("marks a passage that was offered this turn", async () => {
    const { brought, bound } = tool();
    expect((await bound.call({ passage_id: PASSAGE })).isError).toBe(false);
    expect(brought).toEqual([{ kind: "passage", id: PASSAGE }]);
  });

  it("refuses an id that was not offered, and marks nothing", async () => {
    const { brought, bound } = tool();
    expect((await bound.call({ clue_id: OTHER })).isError).toBe(true);
    expect((await bound.call({ passage_id: OTHER })).isError).toBe(true);
    expect(brought).toEqual([]);
  });

  it("refuses a clue id given as a passage, so one kind cannot stand in for the other", async () => {
    const { brought, bound } = tool();
    expect((await bound.call({ passage_id: CLUE })).isError).toBe(true);
    expect(brought).toEqual([]);
  });

  it("refuses both ids or neither, and a value that is not an id", async () => {
    const { brought, bound } = tool();
    expect((await bound.call({})).isError).toBe(true);
    expect((await bound.call({ clue_id: CLUE, passage_id: PASSAGE })).isError).toBe(true);
    expect((await bound.call({ clue_id: "the ledger" })).isError).toBe(true);
    expect(brought).toEqual([]);
  });

  it("marks one thing once a turn", async () => {
    const { brought, bound } = tool();
    await bound.call({ clue_id: CLUE });
    expect((await bound.call({ clue_id: CLUE.toUpperCase() })).isError).toBe(true);
    expect(brought).toHaveLength(1);
  });
});

describe("the lookup", () => {
  const match = (over: Partial<CanonMatch>): CanonMatch => ({ id: "x", part: "lore", knowledge: null, title: "T", distance: 0.5, ...over });

  it("never asks for a secret", () => {
    expect(LOOKUP_PARTS as readonly string[]).not.toContain("secret");
  });

  it("drops a secret and a truth marked secret even if the database returned them", () => {
    const out = readableMatches([
      match({ id: "a", part: "secret", distance: 0.3 }),
      match({ id: "b", part: "truth", knowledge: "secret", distance: 0.3 }),
      match({ id: "c", part: "truth", knowledge: "some", distance: 0.31 }),
    ]);
    expect(out.map((m) => m.id)).toEqual(["c"]);
  });

  it("keeps only what is near the best match, the way the DM's own search cuts", () => {
    const out = readableMatches([match({ id: "near", distance: 0.5 }), match({ id: "far", distance: 0.7 })]);
    expect(out.map((m) => m.id)).toEqual(["near"]);
  });

  it("answers with at most a handful of entries, nearest first", () => {
    const many = Array.from({ length: LOOKUP_HITS_MAX + 3 }, (_, i) => match({ id: `m${i}`, distance: 0.5 + i * 0.001 }));
    const out = readableMatches(many);
    expect(out).toHaveLength(LOOKUP_HITS_MAX);
    expect(out[0].id).toBe("m0");
  });

  it("says who knows a truth only some know, and that nobody else may say it", () => {
    const text = lookupAnswer([{ part: "truth", title: "The river gives back", text: "What it takes, it returns.", knownTo: ["Miss Pellam"], step: null }]);
    expect(text).toContain("known only to Miss Pellam: nobody else may say it");
  });

  // Bug caught: a some-know truth with nobody named was worded "Truth known to all", so the Narrator said it freely.
  it("never words a some-know truth as known to all, named knowers or not", () => {
    const text = lookupAnswer([{ part: "truth", title: "The abbot is a lich", text: "", knowledge: "some", knownTo: [], step: null }]);
    expect(text).not.toContain("known to all");
    expect(text).toContain("nobody named");
  });

  it("includes a lore entry's text, passages and all, and a force's latest step", () => {
    const text = lookupAnswer([
      { part: "lore", title: "The Drowned Bell", text: "A bell. Second passage: it rang once.", knownTo: [], step: null },
      { part: "force", title: "The Gilt Hand", text: "", knownTo: [], step: "They bought the ferry" },
    ]);
    expect(text).toContain("Second passage: it rang once.");
    expect(text).toContain("Latest step: They bought the ferry");
  });

  it("tells the Narrator an empty lookup is its to invent, within the record", () => {
    expect(lookupAnswer([])).toContain("yours to invent");
  });
});

describe("latestChronicle", () => {
  const sitting = (id: string, started_at: string, number: number | null = null) => ({ id, number, started_at, played_on: null, created_at: started_at });
  // Bug caught: the newest note won over the latest sitting.
  it("picks the latest sitting's note, even when an earlier sitting's note was written later", () => {
    const sessions = [sitting("a", "2026-10-01T00:00:00Z"), sitting("b", "2026-10-08T00:00:00Z")];
    const notes = [
      { session_id: "a", content: "A", created_at: "2026-11-01T00:00:00Z" },
      { session_id: "b", content: "B", created_at: "2026-10-09T00:00:00Z" },
    ];
    expect(latestChronicle(sessions, notes)?.content).toBe("B");
  });

  it("goes back to an earlier sitting when the latest has no chronicle, and to nothing when none has", () => {
    const sessions = [sitting("a", "2026-10-01T00:00:00Z"), sitting("b", "2026-10-08T00:00:00Z")];
    expect(latestChronicle(sessions, [{ session_id: "a", content: "A", created_at: "2026-10-02T00:00:00Z" }])?.content).toBe("A");
    expect(latestChronicle(sessions, [])).toBeNull();
  });
});

describe("chronicleExcerpt", () => {
  const doc = (...content: unknown[]) => JSON.stringify({ type: "doc", content });
  const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

  it("leaves out a DM-only passage at any depth, or the Narrator reads what the players never learned", () => {
    const text = chronicleExcerpt(doc(para("The party reached the ferry."), { type: "secretBlock", content: [para("The ferryman is a ghost.")] }, { type: "blockquote", content: [{ type: "secretBlock", content: [para("Nested secret.")] }] }));
    expect(text).toContain("The party reached the ferry.");
    expect(text).not.toContain("ghost");
    expect(text).not.toContain("Nested");
  });

  it("cuts a long entry to a few hundred characters", () => {
    expect(chronicleExcerpt(doc(para("word ".repeat(500)))).length).toBeLessThanOrEqual(600);
  });

  it("reads plain text as it is and an empty entry as nothing", () => {
    expect(chronicleExcerpt("They crossed the river.")).toBe("They crossed the river.");
    expect(chronicleExcerpt(null)).toBe("");
    expect(previouslySection("")).toBe("");
    expect(previouslySection("They crossed.")).toContain("## Previously");
  });
});

describe("bring_out after the party moves on", () => {
  it("refuses a clue of the place the party left, because it no longer lies where they stand", async () => {
    let at: CanonHere = here;
    const brought: BroughtOut[] = [];
    const bound = makeBringOutTool({ offered: () => at, onBroughtOut: (b) => brought.push(b) });
    at = NO_CANON_HERE;
    expect((await bound.call({ clue_id: CLUE })).isError).toBe(true);
    expect(brought).toEqual([]);
  });
});
