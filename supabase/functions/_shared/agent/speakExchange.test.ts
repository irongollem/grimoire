import { describe, expect, it } from "vitest";
import { makeSpeechTools } from "./speak";
import { A, ALDA_SECRET, B, byCharacter, C, cast, recorder, spoke, step, USAGE } from "./speechTestKit";
import type { StoredTurn } from "./transcript";
import type { AgentWithheld } from "./types";

const silent = "DOES: -\nSAYS: -";
const tools = (model: ReturnType<typeof byCharacter>, extra: Partial<Parameters<typeof makeSpeechTools>[0]> = {}) =>
  makeSpeechTools({ stored: [], loadSpeaker: cast, callModel: model.callModel, ...extra });
const said = (lines: { speaker: { name: string }; text: string }[] | undefined) => lines?.map((l) => `${l.speaker.name}: ${l.text}`);

describe("who a line is said to answers it, without the narrator", () => {
  it("lets the one addressed answer in the same call, after the speaker, or the narrator pays a round trip per reply", async () => {
    const m = byCharacter({ Alda: ["SAYS: Where were you last night?\nTO: Bren"], Bren: ["SAYS: Asleep.\nTO: -"] });
    const got = await tools(m).call("speak", { speaker_id: A, happening: "h", present: [B] });
    expect(said(got.lines)).toEqual(["Alda: Where were you last night?", "Bren: Asleep."]);
    expect(m.asked).toEqual(["Alda", "Bren"]);
    expect(got.usage).toEqual([USAGE, USAGE]);
    expect(got.lines?.[0].to).toBe("Bren");
  });

  it("matches the name against the shown names of the people present, not only an exact name", async () => {
    const m = byCharacter({ Alda: ["SAYS: Well?\nTO: bren (the cook)."], Bren: ["SAYS: Fine."] });
    const got = await tools(m).call("speak", { speaker_id: A, happening: "h", present: [B] });
    expect(said(got.lines)).toEqual(["Alda: Well?", "Bren: Fine."]);
  });

  it("stops the exchange at four lines, or two characters could argue for ever on the player's credits", async () => {
    const m = byCharacter({
      Alda: ["SAYS: One.\nTO: Bren", "SAYS: Three.\nTO: Bren", "SAYS: Five.\nTO: Bren"],
      Bren: ["SAYS: Two.\nTO: Alda", "SAYS: Four.\nTO: Alda", "SAYS: Six.\nTO: Alda"],
    });
    const got = await tools(m).call("speak", { speaker_id: A, happening: "h", present: [B] });
    expect(said(got.lines)).toEqual(["Alda: One.", "Bren: Two.", "Alda: Three.", "Bren: Four."]);
    expect(JSON.parse(got.content).ended).toBe("open");
  });

  it("lets nobody answer more than twice however long the chain is allowed to run", async () => {
    const m = byCharacter({
      Alda: ["SAYS: 1\nTO: Bren", "SAYS: 3\nTO: Bren", "SAYS: 5\nTO: Bren"],
      Bren: ["SAYS: 2\nTO: Alda", "SAYS: 4\nTO: Alda", "SAYS: 6\nTO: Alda"],
    });
    const got = await tools(m, { maxChainedAnswers: 10 }).call("speak", { speaker_id: A, happening: "h", present: [B] });
    expect(got.lines).toHaveLength(4);
  });

  it("stops a round of three at four lines too, since nobody has yet spoken twice before the fifth", async () => {
    const m = byCharacter({
      Alda: ["SAYS: 1\nTO: Bren", "SAYS: 4\nTO: Bren"],
      Bren: ["SAYS: 2\nTO: Cole", "SAYS: 5\nTO: Cole"],
      Cole: ["SAYS: 3\nTO: Alda", "SAYS: 6\nTO: Alda"],
    });
    const got = await tools(m).call("speak", { speaker_id: A, happening: "h", present: [B, C] });
    expect(said(got.lines)).toEqual(["Alda: 1", "Bren: 2", "Cole: 3", "Alda: 4"]);
  });

  it("ends the chain, and says so, when a line is said to the player", async () => {
    const m = byCharacter({
      Alda: ["SAYS: Bren, tell them.\nTO: Bren"],
      Bren: ["SAYS: It was the cook, friend.\nTO: player", "SAYS: never"],
    });
    const got = await tools(m).call("speak", { speaker_id: A, happening: "h", present: [B] });
    expect(m.asked).toEqual(["Alda", "Bren"]);
    expect(JSON.parse(got.content).ended).toBe("to_player");
    expect(got.lines?.[1].to).toBeUndefined();
    expect(JSON.parse(got.content).exchange[1]).toMatchObject({ who: "Bren", to: "player" });
  });

  it("reports an exchange that ended on everyone, or on nothing, as open", async () => {
    const m = byCharacter({ Alda: ["SAYS: Listen, all of you.\nTO: everyone"] });
    const got = await tools(m).call("speak", { speaker_id: A, happening: "h" });
    expect(JSON.parse(got.content).ended).toBe("open");
    expect(got.lines?.[0].to).toBe("everyone");
  });

  it("wakes nobody for a name that is not among those listening, and does not claim a recipient", async () => {
    const m = byCharacter({ Alda: ["SAYS: Cole, you saw it.\nTO: Cole", "SAYS: never"] });
    const got = await tools(m).call("speak", { speaker_id: A, happening: "h", present: [] });
    expect(m.asked).toEqual(["Alda"]);
    expect(got.lines?.[0].to).toBeUndefined();
  });

  it("does not let a whisper reach someone it was not whispered to by naming them", async () => {
    const m = byCharacter({ Alda: ["SAYS: Cole, quiet.\nTO: Cole"] });
    const got = await tools(m).call("speak", { speaker_id: A, happening: "h", volume: "whisper", whispered_to: [B], present: [B, C] });
    expect(m.asked).not.toContain("Cole");
    expect(got.lines?.[0].to).toBeUndefined();
  });

  it("keeps the answer to a whisper between the two, or the room hears what was meant for one ear", async () => {
    const m = byCharacter({ Alda: ["SAYS: The key is in the well.\nTO: Bren"], Bren: ["SAYS: WHISPER-ANSWER-7"], Cole: ["SAYS: Hm."] });
    const t = tools(m);
    await t.call("speak", { speaker_id: A, happening: "h", volume: "whisper", whispered_to: [B], present: [B, C] });
    await t.call("speak", { speaker_id: C, happening: "later" });
    expect(JSON.stringify(m.requests[m.requests.length - 1])).not.toContain("WHISPER-ANSWER-7");
  });

  it("tells the one addressed only what they heard: not the narrator's briefing, not the speaker's record", async () => {
    const m = byCharacter({ Alda: ["SAYS: You took it.\nTO: Bren"], Bren: [silent] });
    await tools(m).call("speak", { speaker_id: A, happening: "NARRATOR-BRIEFING-5", present: [B] });
    const asked = JSON.stringify(m.requests[1]);
    expect(asked).toContain("You took it.");
    expect(asked).toContain("said this to you");
    expect(asked).not.toContain("NARRATOR-BRIEFING-5");
    expect(asked).not.toContain(ALDA_SECRET);
    // The line is in what the addressee is told now, not also in the history above it.
    expect(m.requests[1].system).not.toContain("You took it.");
  });

  it("lets the one addressed decline, ending the chain with their call still counted", async () => {
    const m = byCharacter({ Alda: ["SAYS: Well?\nTO: Bren"], Bren: [silent] });
    const got = await tools(m).call("speak", { speaker_id: A, happening: "h", present: [B] });
    expect(got.lines).toHaveLength(1);
    expect(got.usage).toHaveLength(2);
    expect(got.isError).toBe(false);
    expect(JSON.parse(got.content).exchange).toHaveLength(1);
  });

  it("keeps the first line when the one addressed cannot be asked", async () => {
    let calls = 0;
    const t = makeSpeechTools({
      stored: [], loadSpeaker: cast,
      callModel: async () => {
        calls++;
        if (calls === 2) throw new Error("provider down");
        return step("SAYS: Well?\nTO: Bren");
      },
    });
    const got = await t.call("speak", { speaker_id: A, happening: "h", present: [B] });
    expect(got.isError).toBe(false);
    expect(said(got.lines)).toEqual(["Alda: Well?"]);
  });

  it("does not wake someone the narrator is asking in the same round", async () => {
    const m = byCharacter({ Alda: ["SAYS: Bren?\nTO: Bren"], Bren: ["SAYS: Mine."] });
    const t = tools(m);
    await Promise.all([
      t.call("speak", { speaker_id: A, happening: "h", present: [B] }),
      t.call("speak", { speaker_id: B, happening: "h", present: [A] }),
    ]);
    expect(m.asked.filter((n) => n === "Bren")).toHaveLength(1);
  });

  it("lets someone with no record address a character with one", async () => {
    const m = byCharacter({ "The sweeper": ["SAYS: Mind the floor, Bren.\nTO: Bren"], Bren: ["SAYS: Thanks."] });
    const got = await tools(m).call("speak", { speaker_name: "The sweeper", happening: "h", present: [B] });
    expect(said(got.lines)).toEqual(["The sweeper: Mind the floor, Bren.", "Bren: Thanks."]);
  });

  it("keeps what the one addressed chose to remember, and counts them as having been there", async () => {
    const kept: unknown[] = [];
    const there: string[] = [];
    const m = byCharacter({ Alda: ["SAYS: Take the ring.\nTO: Bren"], Bren: ["SAYS: I will.\nREMEMBERS: promise: I took Alda's ring."] });
    await tools(m, { onRemember: (x) => kept.push(x), onSpoke: (id) => there.push(id) }).call("speak", { speaker_id: A, happening: "h", present: [B] });
    expect(kept).toEqual([{ characterId: B, kind: "promise", body: "I took Alda's ring." }]);
    expect(there).toEqual([A, B]);
  });
});

describe("who among the listeners speaks", () => {
  const room = { speaker_id: A, happening: "h", present: [B, C] };

  it("lets only the keenest of two willing listeners speak", async () => {
    const m = byCharacter({ Alda: ["SAYS: Hello."], Bren: ["SAYS: Bren here.\nWANT: 4"], Cole: ["SAYS: Cole here.\nWANT: 5"] });
    const got = await tools(m).call("speak", room);
    expect(said(got.lines)).toEqual(["Alda: Hello.", "Cole: Cole here."]);
  });

  it("gives a tie to whoever comes first in the room", async () => {
    const m = byCharacter({ Alda: ["SAYS: Hello."], Bren: ["SAYS: Bren here.\nWANT: 4"], Cole: ["SAYS: Cole here.\nWANT: 4"] });
    const got = await tools(m).call("speak", { ...room, present: [C, B] });
    expect(said(got.lines)).toEqual(["Alda: Hello.", "Cole: Cole here."]);
  });

  it("does not let a listener who wants it a little speak", async () => {
    const m = byCharacter({ Alda: ["SAYS: Hello."], Bren: ["SAYS: Bren here.\nWANT: 3"] });
    const got = await tools(m).call("speak", room);
    expect(said(got.lines)).toEqual(["Alda: Hello."]);
  });

  it("reads a listener who does not say how much they want it as wanting it a little", async () => {
    const m = byCharacter({ Alda: ["SAYS: Hello."], Bren: ["SAYS: Bren here."] });
    const got = await tools(m).call("speak", room);
    expect(said(got.lines)).toEqual(["Alda: Hello."]);
    expect(got.withheld).toEqual([{ speaker: { id: B, name: "Bren" }, text: "Bren here.", to: null }]);
  });

  it("reads an unreadable WANT as wanting it a little, not as keen", async () => {
    const m = byCharacter({ Alda: ["SAYS: Hello."], Bren: ["SAYS: Bren here.\nWANT: 9"] });
    expect(said((await tools(m).call("speak", room)).lines)).toEqual(["Alda: Hello."]);
  });

  it("lets the one who cut in address someone, and that person answers", async () => {
    const m = byCharacter({ Alda: ["SAYS: Hello."], Bren: ["SAYS: Cole, did you see?\nTO: Cole\nWANT: 5"], Cole: [silent, "SAYS: I did."] });
    const got = await tools(m).call("speak", room);
    expect(said(got.lines)).toEqual(["Alda: Hello.", "Bren: Cole, did you see?", "Cole: I did."]);
  });

  it("counts an interjection toward the same four lines", async () => {
    const m = byCharacter({
      Alda: ["SAYS: 1\nTO: everyone", "SAYS: 3\nTO: Bren"],
      Bren: ["SAYS: 2\nTO: Alda\nWANT: 5", "SAYS: 4\nTO: Alda"],
    });
    const got = await tools(m).call("speak", { speaker_id: A, happening: "h", present: [B] });
    expect(got.lines).toHaveLength(4);
  });

  it("asks nobody to react to a line already said to someone who answers it", async () => {
    const m = byCharacter({ Alda: ["SAYS: Bren?\nTO: Bren"], Bren: [silent] });
    await tools(m).call("speak", room);
    expect(m.asked).toEqual(["Alda", "Bren"]);
  });

  it("returns every call's usage, the listeners' included", async () => {
    const m = byCharacter({ Alda: ["SAYS: Hello."], Bren: ["SAYS: Hi.\nWANT: 5"] });
    const got = await tools(m).call("speak", room);
    expect(got.usage).toHaveLength(3);
  });
});

describe("what a listener wanted to say and did not get to", () => {
  const room = { speaker_id: A, happening: "h", present: [B, C] };
  const heldBack = "I know where the ring went.";

  it("keeps the sentence of the listener who lost the floor, with who it was meant for, and never shows it", async () => {
    const m = byCharacter({
      Alda: ["SAYS: Hello."],
      Bren: [`SAYS: ${heldBack}\nTO: Cole\nWANT: 3`],
      Cole: ["SAYS: Cole here.\nWANT: 5"],
    });
    const got = await tools(m).call("speak", room);
    expect(got.withheld).toEqual([{ speaker: { id: B, name: "Bren" }, text: heldBack, to: "Cole" }]);
    expect(JSON.stringify(got.lines)).not.toContain(heldBack);
    expect(got.content).not.toContain(heldBack);
  });

  it("drops a sentence wanted at 1 or 2", async () => {
    const m = byCharacter({ Alda: ["SAYS: Hello."], Bren: ["SAYS: meh\nWANT: 2"], Cole: ["SAYS: meh\nWANT: 1"] });
    expect((await tools(m).call("speak", room)).withheld).toBeUndefined();
  });

  it("drops a deed with no words, since only a sentence can be kept", async () => {
    const m = byCharacter({ Alda: ["SAYS: Hello."], Bren: ["DOES: Frowns.\nSAYS: -\nWANT: 3"] });
    expect((await tools(m).call("speak", room)).withheld).toBeUndefined();
  });

  it("does not keep the memory of someone who said nothing", async () => {
    const kept: unknown[] = [];
    const m = byCharacter({ Alda: ["SAYS: Hello."], Bren: ["SAYS: x\nWANT: 3\nREMEMBERS: event: I held my tongue."] });
    await tools(m, { onRemember: (x) => kept.push(x) }).call("speak", room);
    expect(kept).toEqual([]);
  });

  it("hands it back to that character on a later call in the same turn, and to nobody else", async () => {
    const m = byCharacter({
      Alda: ["SAYS: Hello."],
      Bren: [`SAYS: ${heldBack}\nWANT: 3`, "SAYS: Now, then."],
      Cole: [silent, silent],
    });
    const t = tools(m);
    await t.call("speak", { speaker_id: A, happening: "h", present: [B] });
    await t.call("speak", { speaker_id: B, happening: "again" });
    expect(m.requests[2].system).toContain(`Something you wanted to say and did not get to: ${heldBack}`);
    const other = byCharacter({ Alda: ["SAYS: Hello."], Bren: [`SAYS: ${heldBack}\nWANT: 3`], Cole: ["SAYS: Hm."] });
    const t2 = tools(other);
    await t2.call("speak", { speaker_id: A, happening: "h", present: [B] });
    await t2.call("speak", { speaker_id: C, happening: "again" });
    expect(JSON.stringify(other.requests[2])).not.toContain(heldBack);
  });

  const stored = (withheld: AgentWithheld[], later: StoredTurn[] = []): StoredTurn[] => [
    ...spoke(1, { speaker_id: A, happening: "h", present: [B] }, "speak", "Hello.", A).map((row, i) =>
      i === 1 ? { ...row, blocks: [{ ...(row.blocks as Record<string, unknown>[])[0], withheld }] } : row),
    ...later,
  ];
  const bren = (text: string): AgentWithheld => ({ speaker: { id: B, name: "Bren" }, text, to: null });

  it("gives it back on a later turn, from the stored result", async () => {
    const rec = recorder(["SAYS: Yes."]);
    await makeSpeechTools({ stored: stored([bren(heldBack)]), loadSpeaker: cast, callModel: rec.callModel }).call("speak", { speaker_id: B, happening: "h" });
    expect(rec.requests[0].system).toContain(heldBack);
  });

  it("lets it go once that character has spoken since, or they would say a stale thing twice", async () => {
    const later = spoke(3, { speaker_id: B, happening: "h" }, "speak", "Something else.", B);
    const rec = recorder(["SAYS: Yes."]);
    await makeSpeechTools({ stored: stored([bren(heldBack)], later), loadSpeaker: cast, callModel: rec.callModel }).call("speak", { speaker_id: B, happening: "h" });
    expect(rec.requests[0].system).not.toContain(heldBack);
  });

  it("carries only the two newest, so an old unsaid thing does not come back after a long quiet", async () => {
    const rec = recorder(["SAYS: Yes."]);
    const rows = stored([bren("OLDEST-ONE"), bren("MIDDLE-ONE"), bren("NEWEST-ONE")]);
    await makeSpeechTools({ stored: rows, loadSpeaker: cast, callModel: rec.callModel }).call("speak", { speaker_id: B, happening: "h" });
    const system = rec.requests[0].system;
    expect(system).not.toContain("OLDEST-ONE");
    expect(system).toContain("MIDDLE-ONE");
    expect(system).toContain("NEWEST-ONE");
  });

  it("lets it go when the same stored call has that character answering after it", async () => {
    const speaker = (id: string, name: string) => ({ id, name });
    const rows: StoredTurn[] = [
      { seq: 1, role: "assistant", blocks: [{ type: "tool_call", id: "c1", name: "speak", input: { speaker_id: A, happening: "h", present: [B, C] } }] },
      {
        seq: 2, role: "user",
        blocks: [{
          type: "tool_result", callId: "c1", content: "x", isError: false,
          lines: [
            { kind: "spoken", speaker: speaker(A, "Alda"), text: "Hello." },
            { kind: "spoken", speaker: speaker(C, "Cole"), text: "Bren?" },
            { kind: "spoken", speaker: speaker(B, "Bren"), text: "Here." },
          ],
          withheld: [bren(heldBack)],
        }],
      },
    ];
    const rec = recorder(["SAYS: Yes."]);
    await makeSpeechTools({ stored: rows, loadSpeaker: cast, callModel: rec.callModel }).call("speak", { speaker_id: B, happening: "h" });
    expect(rec.requests[0].system).not.toContain(heldBack);
  });

  it("never puts it into another character's call or into the narrator's result", async () => {
    const rec = recorder(["SAYS: Hm."]);
    const got = await makeSpeechTools({ stored: stored([bren(heldBack)]), loadSpeaker: cast, callModel: rec.callModel }).call("speak", { speaker_id: C, happening: "h" });
    expect(JSON.stringify(rec.requests[0])).not.toContain(heldBack);
    expect(got.content).not.toContain(heldBack);
  });
});

describe("a line addressed to the player's character by name", () => {
  it("ends the exchange as to_player, as TO: player does, or the narrator is asked to answer a question already put to the player", async () => {
    const m = byCharacter({ Alda: ["SAYS: And you, Wren?\nTO: Wren"] });
    const got = await tools(m, { playerName: "Wren Ashfield" }).call("speak", { speaker_id: A, happening: "h", present: [B] });
    expect(JSON.parse(got.content).ended).toBe("to_player");
    expect(JSON.parse(got.content).exchange[0].to).toBe("player");
  });

  it("does not read the name as the player's when the conversation has no character", async () => {
    const m = byCharacter({ Alda: ["SAYS: And you, Wren?\nTO: Wren"] });
    const got = await tools(m).call("speak", { speaker_id: A, happening: "h", present: [B] });
    expect(JSON.parse(got.content).ended).toBe("open");
  });

  it("prefers a recorded character who shares the name, so that character can still be answered", async () => {
    const m = byCharacter({ Alda: ["SAYS: Well?\nTO: Bren"], Bren: ["SAYS: Fine."] });
    const got = await tools(m, { playerName: "Bren Vale" }).call("speak", { speaker_id: A, happening: "h", present: [B] });
    expect(said(got.lines)).toEqual(["Alda: Well?", "Bren: Fine."]);
  });

  it("tells the listener who answers the player's words under the character's name", async () => {
    const m = byCharacter({ Alda: ["SAYS: Ask Bren.\nTO: Bren"], Bren: ["DOES: -\nSAYS: -"] });
    await tools(m, { playerName: "Wren Ashfield" }).call("speak", { speaker_id: A, happening: "h", present: [B], player_said: "Who has the keys?" });
    expect(JSON.stringify(m.requests[1])).toContain("Wren Ashfield said: Who has the keys?");
  });
});

describe("a listener who only saw a whisper pass, when the player has a name", () => {
  it("is not asked to answer just because the player's words, now under their name, were heard", async () => {
    const m = byCharacter({ Alda: ["SAYS: Closer.\nTO: -"] });
    await tools(m, { playerName: "Wren Ashfield" }).call("speak", {
      speaker_id: A, happening: "h", present: [B, C], volume: "whisper", whispered_to: [C], player_said: "Hello",
    });
    expect(m.asked).not.toContain("Bren");
  });
});
