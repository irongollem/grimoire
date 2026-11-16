import { describe, expect, it } from "vitest";
import { heardBy, trimHeard, type Heard } from "./hearing";
import { parseSpeakInput } from "./speakInput";
import { A, B, C, spoke, spokeLines } from "./speechTestKit";
import type { StoredTurn } from "./transcript";

describe("heardBy", () => {
  const rows = [
    ...spoke(1, { speaker_id: A, happening: "A is asked", present: [B] }, "speak", "A line", A),
    ...spoke(3, { speaker_name: "Sweeper", what: "sweeps", present: ["Bob"] }, "act", "Sweeps the floor."),
  ];
  it("does not hand a bystander the speaker's private happening", () => {
    const h = heardBy(rows, { id: B, name: "B" });
    expect(h).toHaveLength(1);
    expect(h[0].happening).toBeNull();
  });
  it("gives the speaker its own happening", () => {
    expect(heardBy(rows, { id: A, name: "A" })[0].happening).toBe("A is asked");
  });
  it("never lets a character hear what was said when it was not present", () => {
    expect(heardBy(rows, { id: "33333333-3333-4333-8333-333333333333", name: "C" })).toEqual([]);
  });
  it("matches a record-less listener by name, ignoring case and spaces", () => {
    expect(heardBy(rows, { id: null, name: "  bob " }).map((h) => h.text)).toEqual(["Sweeps the floor."]);
  });
  it("skips a failed call's result", () => {
    const bad: StoredTurn[] = [
      { seq: 1, role: "assistant", blocks: [{ type: "tool_call", id: "c", name: "speak", input: { speaker_id: A, happening: "h" } }] },
      { seq: 2, role: "user", blocks: [{ type: "tool_result", callId: "c", content: "err", isError: true, lines: [{ kind: "spoken", speaker: { id: A, name: "A" }, text: "no" }] }] },
    ];
    expect(heardBy(bad, { id: A, name: "A" })).toEqual([]);
  });
  it("reads rows in seq order whatever order they arrive in", () => {
    const h = heardBy([...rows].reverse(), { id: A, name: "A" });
    expect(h.map((x) => x.text)).toEqual(["A line"]);
    const both = heardBy([...rows].reverse(), { id: null, name: "Bob" });
    expect(both).toHaveLength(1);
  });
});

describe("trimHeard", () => {
  const mk = (n: number, len = 1): Heard[] =>
    Array.from({ length: n }, (_, i) => ({ speaker: "S", kind: "spoken" as const, text: `${i}`.padEnd(len, "x"), happening: null }));
  it("keeps the newest entries, oldest first", () => {
    expect(trimHeard(mk(30), 20).map((h) => h.text[0] + h.text.slice(1))).toEqual(mk(30).slice(10).map((h) => h.text));
  });
  it("stops at the character budget, dropping the oldest", () => {
    const out = trimHeard(mk(5, 100), 20, 250);
    expect(out).toHaveLength(2);
    expect(out[1].text).toBe(mk(5, 100)[4].text);
  });
});

describe("the player's own words", () => {
  const asked = "Where is the key?";

  it("reach a bystander who was present, or B would answer A's reply without knowing the question", () => {
    const stored = spoke(1, { speaker_id: A, happening: "h", player_said: asked, present: [B] }, "speak", "In the well.", A);
    expect(heardBy(stored, { id: B, name: "Bram" }).map((h) => h.text)).toEqual([asked, "In the well."]);
  });

  it("never reach a character who was not there", () => {
    const stored = spoke(1, { speaker_id: A, happening: "h", player_said: asked }, "speak", "In the well.", A);
    expect(heardBy(stored, { id: B, name: "Bram" })).toEqual([]);
  });

  it("are heard once by someone who listened to two characters answer them", () => {
    const stored = [
      ...spoke(1, { speaker_id: A, happening: "h", player_said: asked, present: [B] }, "speak", "In the well.", A),
      ...spoke(3, { speaker_id: B, happening: "h", player_said: asked, present: [A] }, "speak", "She lies.", B),
    ];
    const texts = heardBy(stored, { id: B, name: "Bram" }).map((h) => h.text);
    expect(texts.filter((t) => t === asked)).toHaveLength(1);
  });

  it("are refused when longer than a sentence or two, so the field cannot carry a briefing", () => {
    expect(parseSpeakInput({ speaker_id: A, happening: "h", player_said: "x".repeat(401) }).ok).toBe(false);
  });
});

describe("who hears what, by how loud it was said", () => {
  const bram = { id: B, name: "Bram" };
  const cole = { id: C, name: "Cole" };
  const texts = (stored: StoredTurn[], who: { id: string; name: string }) => heardBy(stored, who).map((h) => h.text);

  it("keeps a whisper from the rest of the room, who only see that one passed", () => {
    const stored = spoke(1, { speaker_id: A, happening: "h", volume: "whisper", whispered_to: [B], present: [B, C] }, "speak", "The key is in the well.", A);
    expect(texts(stored, bram)).toEqual(["The key is in the well."]);
    expect(JSON.stringify(heardBy(stored, cole))).not.toContain("well");
    expect(heardBy(stored, cole)).toHaveLength(1);
  });

  it("does not carry ordinary speech to someone in another room", () => {
    const stored = spoke(1, { speaker_id: A, happening: "h", present: [B], also_heard_by: [C] }, "speak", "In the well.", A);
    expect(texts(stored, cole)).toEqual([]);
  });

  it("carries a shout to the next room", () => {
    const stored = spoke(1, { speaker_id: A, happening: "h", volume: "shout", present: [B], also_heard_by: [C] }, "speak", "Guards!", A);
    expect(texts(stored, cole)).toEqual(["Guards!"]);
  });

  it("carries quiet words through a device to the one who holds it, and to nobody else outside the room", () => {
    const stored = spoke(1, { speaker_id: A, happening: "h", via: "a sending stone", also_heard_by: [C] }, "speak", "It is done.", A);
    expect(texts(stored, cole)).toEqual(["It is done."]);
    expect(texts(stored, bram)).toEqual([]);
  });

  it("keeps what the player whispered to one character from the others present", () => {
    const stored = spoke(1, { speaker_id: A, happening: "h", player_said: "Meet me at dusk.", player_volume: "whisper", present: [B] }, "speak", "Very well.", A);
    expect(JSON.stringify(heardBy(stored, bram))).not.toContain("dusk");
    expect(texts(stored, { id: A, name: "Mira" })).toContain("Meet me at dusk.");
  });

  it("shows a deed to the room only, even when the same call names someone elsewhere", () => {
    const stored = spoke(1, { speaker_name: "Hound", what: "Hides the letter.", present: [B], also_heard_by: [C] }, "act", "Hides the letter.");
    expect(texts(stored, cole)).toEqual([]);
    expect(texts(stored, bram)).toEqual(["Hides the letter."]);
  });

  const both = [{ kind: "acted" as const, text: "Hurls the lantern." }, { kind: "spoken" as const, text: "Fire!" }];

  it("hands a listener the player's words, then the deed, then the words, in that order", () => {
    const stored = spokeLines(1, { speaker_id: A, happening: "h", player_said: "Hold still.", present: [B] }, "speak", both, A);
    expect(texts(stored, bram)).toEqual(["Hold still.", "Hurls the lantern.", "Fire!"]);
  });

  it("keeps a deed from someone a shout reached, who still hears the words", () => {
    const stored = spokeLines(1, { speaker_id: A, happening: "h", volume: "shout", present: [B], also_heard_by: [C] }, "speak", both, A);
    expect(texts(stored, cole)).toEqual(["Fire!"]);
    expect(texts(stored, bram)).toEqual(["Hurls the lantern.", "Fire!"]);
  });

  it("lets the room see a deed but not make out whispered words from the same turn", () => {
    const stored = spokeLines(1, { speaker_id: A, happening: "h", volume: "whisper", whispered_to: [B], present: [B, C] }, "speak", both, A);
    expect(texts(stored, cole)).toEqual(["Hurls the lantern.", "Whispers something that cannot be made out."]);
    expect(texts(stored, bram)).toEqual(["Hurls the lantern.", "Fire!"]);
  });

  it("gives the speaker its own happening once, not on both lines", () => {
    const stored = spokeLines(1, { speaker_id: A, happening: "A-HAPPENING" }, "speak", both, A);
    expect(heardBy(stored, { id: A, name: "Mira" }).map((h) => h.happening)).toEqual(["A-HAPPENING", null]);
  });

  it("refuses words that leave the room with neither a shout nor a device", () => {
    expect(parseSpeakInput({ speaker_id: A, happening: "h", also_heard_by: [C] }).ok).toBe(false);
    expect(parseSpeakInput({ speaker_id: A, happening: "h", volume: "shout", also_heard_by: [C] }).ok).toBe(true);
  });

  it("reads an unknown stored volume as ordinary speech, never as a shout", () => {
    const stored = spoke(1, { speaker_id: A, happening: "h", volume: "bellow", present: [B], also_heard_by: [C] }, "speak", "Hm.", A);
    expect(texts(stored, cole)).toEqual([]);
    expect(texts(stored, bram)).toEqual(["Hm."]);
  });
});

