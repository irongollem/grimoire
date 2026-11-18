import { describe, expect, it } from "vitest";
import { unfinishedBusiness } from "./unfinished.ts";
import { A, B, C, spoke } from "./speechTestKit";
import type { StoredTurn } from "./transcript";
import type { AgentWithheld } from "./types";

// Alda speaks in turn 1; `withheld` is what the listeners wanted to say then and did not get to.
const sitting = (withheld: AgentWithheld[], later: StoredTurn[] = []): StoredTurn[] => [
  ...spoke(1, { speaker_id: A, happening: "h", present: [B, C] }, "speak", "Hello.", A).map((row, i) =>
    i === 1 ? { ...row, blocks: [{ ...(row.blocks as Record<string, unknown>[])[0], withheld }] } : row),
  ...later,
];
const bren = (text: string, to: string | null = null): AgentWithheld => ({ speaker: { id: B, name: "Bren" }, text, to });

describe("unfinishedBusiness", () => {
  // Bug caught: what a character was about to say lost when the player gets up, so next time they have nothing
  // on their mind.
  it("keeps what a character still had to say when the sitting ended, in their own voice", () => {
    expect(unfinishedBusiness(sitting([bren("I know where the ring went.", "Alda")]))).toEqual([
      { characterId: B, body: 'I meant to say this to Alda and did not get to: "I know where the ring went."' },
    ]);
    expect(unfinishedBusiness(sitting([bren("Mind the third stair.", "everyone")]))[0].body).toContain("to everyone there");
    expect(unfinishedBusiness(sitting([bren("Mind the third stair.")]))[0].body).toBe('I meant to say this and did not get to: "Mind the third stair."');
  });

  // Bug caught: a sentence the character did get to say later carried as still unsaid, so they repeat themselves
  // next time as if it were news.
  it("carries nothing for a character who spoke again afterwards", () => {
    const later = spoke(3, { speaker_id: B, happening: "h" }, "speak", "I know where the ring went.", B);
    expect(unfinishedBusiness(sitting([bren("I know where the ring went.")], later))).toEqual([]);
  });

  it("carries nothing from a sitting in which nobody was kept back", () => {
    expect(unfinishedBusiness(sitting([]))).toEqual([]);
    expect(unfinishedBusiness([])).toEqual([]);
  });

  // Bug caught: one character's unsaid sentence filed under another's memory.
  it("keeps each character's own", () => {
    const out = unfinishedBusiness(sitting([bren("Mine."), { speaker: { id: C, name: "Cole" }, text: "And mine.", to: null }]));
    expect(out.map((u) => [u.characterId, u.body.includes("Mine.") || u.body.includes("And mine.")])).toEqual([[B, true], [C, true]]);
    expect(out.find((u) => u.characterId === C)?.body).toContain("And mine.");
  });
});
