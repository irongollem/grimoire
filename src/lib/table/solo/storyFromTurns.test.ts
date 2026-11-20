import { describe, expect, it } from "vitest";
import { factItems, storyFromTurns, turnsStarted, type StoredTurn } from "./storyFromTurns";
import type { KeptLine } from "./boardKeep";

const MODEL_WORDING = "[The player says, aloud: Who are you?] (written for the model)";
const DM_ONLY = "The heir is lying; the real heir died in the fire.";

const turns: StoredTurn[] = [
  { seq: 1, role: "user", blocks: [{ type: "text", text: MODEL_WORDING, player: { kind: "say", text: "Who are you?" } }] },
  {
    seq: 2,
    role: "assistant",
    blocks: [
      { type: "text", text: "A young person waits on the step." },
      { type: "tool_call", id: "t1", name: "get", input: { id: "secret-npc", note: DM_ONLY } },
    ],
  },
  {
    seq: 3,
    role: "user",
    blocks: [
      {
        type: "tool_result",
        id: "t1",
        content: DM_ONLY,
        withheld: DM_ONLY,
        lines: [
          { kind: "spoken", speaker: { id: "n1", name: "Honeycomb" }, text: "Honeycomb. Apprentice, once." },
          { kind: "acted", speaker: { id: "n1", name: "Honeycomb" }, text: "Holds out the keys." },
        ],
      },
    ],
  },
  { seq: 4, role: "assistant", blocks: [{ type: "text", text: "Honeycomb still stands there, waiting.", unshown: true }] },
  { seq: 5, role: "user", blocks: [{ type: "text", text: "[The player does: I follow.]", player: { kind: "do", text: "I follow." } }] },
];

describe("storyFromTurns", () => {
  const drawn = JSON.stringify(storyFromTurns(turns));

  // Bug caught: drawing the user block's own `text`, which is wording meant for the model, instead of what the player typed.
  it("draws the player's move from `player`, never the block's model-facing text", () => {
    expect(storyFromTurns(turns)[0]).toMatchObject({ kind: "player", mode: "say", text: "Who are you?" });
    expect(drawn).not.toContain("written for the model");
    expect(drawn).not.toContain("The player does:");
  });

  // Bug caught: replaying narration the player never saw (judged to only repeat a line) on reload.
  it("does not draw an unshown narration block", () => {
    expect(drawn).not.toContain("still stands there");
  });

  // Bug caught: a tool call's input or a result's content (both can hold DM-only material) reaching the page.
  it("draws nothing from a tool call's input or a tool result's content", () => {
    expect(drawn).not.toContain(DM_ONLY);
    expect(drawn).not.toContain("secret-npc");
  });

  // Bug caught: lines dropped, or reordered, on reload, so a conversation reads differently the second time.
  it("draws a tool result's lines in order, between the narration around them", () => {
    expect(storyFromTurns(turns).map((i) => `${i.kind}:${"text" in i ? i.text : ""}`)).toEqual([
      "player:Who are you?",
      "narration:A young person waits on the step.",
      "spoken:Honeycomb. Apprentice, once.",
      "acted:Holds out the keys.",
      "player:I follow.",
    ]);
  });

  // Bug caught: rows read in the order the database returned them rather than the conversation's own order.
  it("orders by seq, whatever order the rows came in", () => {
    const shuffled = [turns[4], turns[0], turns[2], turns[1], turns[3]];
    expect(storyFromTurns(shuffled)).toEqual(storyFromTurns(turns));
  });

  // Bug caught: ids that change between loads, so the page re-keys and re-renders every item on a refetch.
  it("gives every item the same id each time it is drawn", () => {
    expect(storyFromTurns(turns).map((i) => i.id)).toEqual(storyFromTurns(turns).map((i) => i.id));
    expect(new Set(storyFromTurns(turns).map((i) => i.id)).size).toBe(storyFromTurns(turns).length);
  });

  // Bug caught: a row with malformed jsonb taking the whole page down.
  it("skips blocks and lines it cannot read", () => {
    const odd: StoredTurn[] = [
      { seq: 1, role: "assistant", blocks: "not an array" },
      { seq: 2, role: "user", blocks: [null, 5, { type: "tool_result", lines: [{ kind: "spoken" }, { kind: "acted", speaker: { id: null, name: "A" }, text: "Waves." }] }] },
    ];
    expect(storyFromTurns(odd)).toHaveLength(1);
  });
});

describe("factItems", () => {
  it("turns what went on record into quiet lines", () => {
    expect(factItems([{ id: "f1", body: "The heir holds the keys." }])).toEqual([
      { id: "fact-f1", kind: "margin", text: "The heir holds the keys.", count: 1, record: true },
    ]);
  });
});

describe("storyFromTurns for a roll", () => {
  const roll = { label: "Wisdom (Perception)", faces: [13], kept: 13, bonus: 4, total: 17, mode: "normal", atTable: true };

  // Bug caught: the roll drawn after the words it was sent with, which is not the order it was played in.
  it("draws a stored roll before the player's words", () => {
    const items = storyFromTurns([{ seq: 1, role: "user", blocks: [{ type: "text", text: "for the model", roll, player: { kind: "do", text: "I look." } }] }]);
    expect(items.map((i) => i.kind)).toEqual(["roll", "player"]);
  });

  // Bug caught: a roll sent alone drawing an empty player box, or no roll line at all.
  it("draws only the roll line when the player sent no words, whether `player` is absent or empty", () => {
    for (const player of [undefined, { kind: "do", text: "" }]) {
      const items = storyFromTurns([{ seq: 1, role: "user", blocks: [{ type: "text", text: "for the model", roll, ...(player ? { player } : {}) }] }]);
      expect(items.map((i) => i.kind)).toEqual(["roll"]);
    }
  });

  // Bug caught: a stored roll whose arithmetic does not hold drawn as the player's roll.
  it("ignores a stored roll that does not add up", () => {
    const items = storyFromTurns([{ seq: 1, role: "user", blocks: [{ type: "text", text: "x", roll: { ...roll, total: 40 }, player: { kind: "say", text: "Hi" } }] }]);
    expect(items.map((i) => i.kind)).toEqual(["player"]);
  });

  // Bug caught: the Narrator's roll gone after a reload, or drawn after the line that came of it.
  it("redraws a stored open roll of the Narrator before the lines of the same result, and skips a malformed one", () => {
    const dm = { label: "Warmth", dice: "1d20", faces: [20], dropped: [], modifier: 0, total: 20 };
    const items = storyFromTurns([
      { seq: 1, role: "user", blocks: [{ type: "tool_result", dmRoll: dm, lines: [{ kind: "acted", speaker: { id: null, name: "A" }, text: "Waves." }] }] },
      { seq: 2, role: "user", blocks: [{ type: "tool_result", dmRoll: { ...dm, faces: [] } }] },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["dmRoll", "acted"]);
  });
});

describe("the board's lines in a reopened sitting", () => {
  const margin = (text: string, after: number): KeptLine => ({ after, line: { kind: "margin", text }, byServer: true });
  const texts = (kept: KeptLine[]) => storyFromTurns(turns, kept).map((i) => ("text" in i ? i.text : i.kind));

  // Bug caught (seen in play): after a reload a fight read as its narration alone, every attack and round gone;
  // or the lines all gathered at the foot of the page, after turns played long after the fight.
  it("puts each line back after the turns that had been played when it was written", () => {
    // `turns` holds two turns: "Who are you?" (rows 1 to 4) and "I follow." (row 5).
    expect(texts([margin("before anything", 0), margin("after the first turn", 1), margin("after the second", 2), margin("later still", 9)])).toEqual([
      "before anything",
      "Who are you?",
      "A young person waits on the step.",
      "Honeycomb. Apprentice, once.",
      "Holds out the keys.",
      "after the first turn",
      "I follow.",
      "after the second",
      "later still",
    ]);
  });

  // Bug caught: a tool's answer counted as a turn of its own, so every line lands one turn early for each tool used.
  it("counts a turn by what was sent to the Narrator, not by a tool's answer", () => {
    expect(turnsStarted(turns)).toBe(2);
  });

  // Bug caught: two lines given the same id, which Vue then draws once.
  it("gives every line an id of its own", () => {
    const ids = storyFromTurns(turns, [margin("a", 1), margin("a", 1)]).map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("what the Narrator put in front of the player", () => {
  const HANDOUT = "11111111-2222-4333-8444-555555555555";
  const withShown = (shown: unknown): StoredTurn[] => [{ seq: 1, role: "user", blocks: [{ type: "tool_result", id: "t1", content: "private", shown }] }];

  // Bug caught: a handout or a picture gone from the page after a reload, though the turn kept it.
  it("is drawn again where it happened", () => {
    expect(storyFromTurns(withShown({ kind: "handout", id: HANDOUT, title: "The Guild's letter" }))).toEqual([
      { id: "turn-1-0-shown", kind: "shown", shown: { kind: "handout", id: HANDOUT, title: "The Guild's letter" } },
    ]);
  });

  // Bug caught: a shared place coming back from a reopened sitting without its id, map or nook, so the card links nowhere.
  it("draws a handed-over place again with what it brought", () => {
    const place = { kind: "place", id: HANDOUT, title: "The Salt Hall", url: null, hasMap: true, hasNook: false };
    expect(storyFromTurns(withShown(place))).toEqual([{ id: "turn-1-0-shown", kind: "shown", shown: place }]);
  });

  // Bug caught: a stored address drawn into an image without being read (jsonb is untrusted).
  it("is not drawn when it is not a whole handout or picture", () => {
    expect(storyFromTurns(withShown({ kind: "picture", of: "person", title: "Honeycomb", url: "javascript:alert(1)" }))).toEqual([]);
    expect(storyFromTurns(withShown("nonsense"))).toEqual([]);
  });
});
