import { describe, expect, it } from "vitest";
import { parseTurnAnswer } from "./characterTurn";
import { makeSpeechTools, pickRecorded } from "./speak";
import { parseActInput, parseSpeakInput } from "./speakInput";
import { A, B, recorder, spoke, step, USAGE } from "./speechTestKit";

describe("parseSpeakInput", () => {
  const ok = { speaker_id: A, happening: "Someone asks about the keys." };
  it("accepts a plain recorded speaker", () => {
    expect(parseSpeakInput(ok).ok).toBe(true);
  });
  it.each([
    ["both speaker fields given", { ...ok, speaker_name: "X" }],
    ["no speaker field", { happening: "h" }],
    ["manner with a record", { ...ok, manner: "gruff" }],
    ["non-uuid speaker_id", { ...ok, speaker_id: "mira" }],
    ["blank happening after trim", { ...ok, happening: "   " }],
    ["happening over 600", { ...ok, happening: "x".repeat(601) }],
    ["manner over 200", { speaker_name: "X", happening: "h", manner: "x".repeat(201) }],
    ["present not a list", { ...ok, present: "Bob" }],
    ["more than 12 present", { ...ok, present: Array.from({ length: 13 }, (_, i) => `n${i}`) }],
    ["happening not a string", { ...ok, happening: 5 }],
  ])("refuses %s with a sentence", (_t, input) => {
    const r = parseSpeakInput(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
  });
  it("accepts manner for a character with no record", () => {
    expect(parseSpeakInput({ speaker_name: " The sweeper ", happening: "h", manner: "mutters" })).toMatchObject({
      ok: true, value: { name: "The sweeper", manner: "mutters" },
    });
  });
});

describe("parseActInput", () => {
  it("refuses an empty what", () => {
    expect(parseActInput({ speaker_name: "X", what: " " }).ok).toBe(false);
  });
  it("refuses a what over 300", () => {
    expect(parseActInput({ speaker_name: "X", what: "x".repeat(301) }).ok).toBe(false);
  });
  it("refuses both speaker fields", () => {
    expect(parseActInput({ speaker_id: A, speaker_name: "X", what: "w" }).ok).toBe(false);
  });
});

describe("makeSpeechTools", () => {
  const SECRET_A = "A-SECRET-PROFILE-77";
  const MEM_A = "A-SECRET-MEMORY-88";
  const HAPPEN_A = "A-PRIVATE-HAPPENING-99";
  const loadSpeaker = async (id: string) =>
    id === A ? { id: A, shownName: "Alda", profile: `Name: Alda\n${SECRET_A}`, memories: MEM_A }
    : id === B ? { id: B, shownName: "Bren", profile: "Name: Bren", memories: "" }
    : null;

  it("refuses a name outside the speech tools", async () => {
    const t = makeSpeechTools({ stored: [], loadSpeaker, callModel: recorder([]).callModel });
    expect((await t.call("roll", {})).isError).toBe(true);
  });

  it("makes no model call for a speaker id with no record", async () => {
    const rec = recorder([]);
    const t = makeSpeechTools({ stored: [], loadSpeaker, callModel: rec.callModel });
    const r = await t.call("speak", { speaker_id: "33333333-3333-4333-8333-333333333333", happening: "h" });
    expect(r.isError).toBe(true);
    expect(rec.requests).toHaveLength(0);
  });

  it("returns the parse error and calls no model for bad input", async () => {
    const rec = recorder([]);
    const t = makeSpeechTools({ stored: [], loadSpeaker, callModel: rec.callModel });
    const r = await t.call("speak", { happening: "h" });
    expect(r.isError).toBe(true);
    expect(rec.requests).toHaveLength(0);
  });

  it("returns the deed then the words under the disguise name, with usage", async () => {
    const rec = recorder(["DOES: Wipes the bar.\nSAYS: \"Welcome.\""]);
    const t = makeSpeechTools({ stored: [], loadSpeaker, callModel: rec.callModel });
    const r = await t.call("speak", { speaker_id: A, happening: "A guest arrives." });
    expect(r).toMatchObject({ isError: false, usage: [USAGE] });
    expect(r.lines).toEqual([
      { kind: "acted", speaker: { id: A, name: "Alda" }, text: "Wipes the bar." },
      { kind: "spoken", speaker: { id: A, name: "Alda" }, text: "Welcome." },
    ]);
    expect(JSON.parse(r.content).exchange).toEqual([{ who: "Alda", to: null, did: "Wipes the bar.", said: "Welcome." }]);
  });

  it("reports a turn of nothing as an error but still returns the spent usage", async () => {
    const t = makeSpeechTools({ stored: [], loadSpeaker, callModel: async () => step("DOES: -\nSAYS: -") });
    const r = await t.call("speak", { speaker_id: A, happening: "h" });
    expect(r.isError).toBe(true);
    expect(r.content).toContain("neither says nor does");
    expect(r.usage).toEqual([USAGE]);
    expect(r.lines).toBeUndefined();
  });

  it("shows only the deed when the character says nothing, and only the words when it does nothing", async () => {
    const deed = makeSpeechTools({ stored: [], loadSpeaker, callModel: async () => step("DOES: Nods.\nSAYS: -") });
    expect((await deed.call("speak", { speaker_id: A, happening: "h" })).lines?.map((l) => l.kind)).toEqual(["acted"]);
    const words = makeSpeechTools({ stored: [], loadSpeaker, callModel: async () => step("DOES: -\nSAYS: Hm.") });
    expect((await words.call("speak", { speaker_id: A, happening: "h" })).lines?.map((l) => l.kind)).toEqual(["spoken"]);
  });

  it("act makes no model call and shows the deed of someone with no record", async () => {
    const rec = recorder([]);
    const t = makeSpeechTools({ stored: [], loadSpeaker, callModel: rec.callModel });
    const r = await t.call("act", { speaker_name: " Sweeper ", what: "Sweeps." });
    expect(rec.requests).toHaveLength(0);
    expect(r).toEqual({ content: "Shown.", isError: false, lines: [{ kind: "acted", speaker: { id: null, name: "Sweeper" }, text: "Sweeps." }] });
  });

  it("refuses act for a character with a record, with no model call and no lookup, so the narrator cannot choose its deeds", async () => {
    const rec = recorder([]);
    let lookups = 0;
    const t = makeSpeechTools({
      stored: [], callModel: rec.callModel,
      loadSpeaker: async (id) => { lookups++; return loadSpeaker(id); },
    });
    const r = await t.call("act", { speaker_id: A, what: "Draws a dagger." });
    expect(r.isError).toBe(true);
    expect(r.content).toContain("speak");
    expect(r.lines).toBeUndefined();
    expect(rec.requests).toHaveLength(0);
    expect(lookups).toBe(0);
  });

  it("does not remember a refused act, or the deed the narrator chose would still be heard by the room", async () => {
    const rec = recorder(["ok"]);
    const t = makeSpeechTools({ stored: [], loadSpeaker, callModel: rec.callModel });
    await t.call("act", { speaker_id: A, what: "REFUSED-DEED", present: [B] });
    await t.call("speak", { speaker_id: B, happening: "h" });
    expect(rec.requests[0].system).not.toContain("REFUSED-DEED");
  });

  it("hands a deed to the room but not to someone it was shouted to, while the shouted words do arrive", async () => {
    const C = "33333333-3333-4333-8333-333333333333";
    // The second answer is Bren's own, unasked, reaction to the shout: silence.
    const rec = recorder(["DOES: Hurls the lantern.\nSAYS: Fire!", "DOES: -\nSAYS: -", "ok", "ok"]);
    const t = makeSpeechTools({ stored: [], callModel: rec.callModel, loadSpeaker: async (id) => id === C ? { id: C, shownName: "Cole", profile: "Name: Cole", memories: "" } : loadSpeaker(id) });
    await t.call("speak", { speaker_id: A, happening: "h", volume: "shout", present: [B], also_heard_by: [C] });
    await t.call("speak", { speaker_id: B, happening: "h2" });
    await t.call("speak", { speaker_id: C, happening: "h3" });
    expect(rec.requests[2].system).toContain("Alda did: Hurls the lantern.");
    expect(rec.requests[2].system).toContain("Alda said: Fire!");
    expect(rec.requests[3].system).not.toContain("Hurls the lantern");
    expect(rec.requests[3].system).toContain("Alda said: Fire!");
  });

  it("gives a character its own profile and memories, or it could not speak as itself", async () => {
    const rec = recorder(["ok"]);
    const t = makeSpeechTools({ stored: [], loadSpeaker, callModel: rec.callModel });
    await t.call("speak", { speaker_id: A, happening: "h" });
    expect(rec.requests[0].system).toContain(SECRET_A);
    expect(rec.requests[0].system).toContain(MEM_A);
  });

  it("never puts A's profile, memories or happening in B's call, same turn", async () => {
    const rec = recorder(["A says hello", "B replies"]);
    const t = makeSpeechTools({ stored: [], loadSpeaker, callModel: rec.callModel });
    await t.call("speak", { speaker_id: A, happening: HAPPEN_A });
    await t.call("speak", { speaker_id: B, happening: "B is asked something.", present: [A] });
    const bSystem = rec.requests[1].system;
    expect(bSystem).not.toContain(SECRET_A);
    expect(bSystem).not.toContain(MEM_A);
    expect(JSON.stringify(rec.requests[1])).not.toContain(HAPPEN_A);
  });

  it("B hears A's line in the same turn when listed present, and not when left out", async () => {
    const heardRec = recorder(["A-LINE-ONE", "DOES: -\nSAYS: -", "ok"]);
    const t1 = makeSpeechTools({ stored: [], loadSpeaker, callModel: heardRec.callModel });
    await t1.call("speak", { speaker_id: A, happening: "h", present: [B] });
    await t1.call("speak", { speaker_id: B, happening: "h2" });
    expect(heardRec.requests[2].system).toContain("A-LINE-ONE");

    const absentRec = recorder(["A-LINE-TWO", "ok"]);
    const t2 = makeSpeechTools({ stored: [], loadSpeaker, callModel: absentRec.callModel });
    await t2.call("speak", { speaker_id: A, happening: "h" });
    await t2.call("speak", { speaker_id: B, happening: "h2" });
    expect(absentRec.requests[1].system).not.toContain("A-LINE-TWO");
  });

  it("does not leak a stored line B was absent for", async () => {
    const stored = spoke(1, { speaker_id: A, happening: HAPPEN_A }, "speak", "STORED-A-LINE", A);
    const rec = recorder(["ok"]);
    const t = makeSpeechTools({ stored, loadSpeaker, callModel: rec.callModel });
    await t.call("speak", { speaker_id: B, happening: "h" });
    expect(JSON.stringify(rec.requests[0])).not.toContain("STORED-A-LINE");
    expect(JSON.stringify(rec.requests[0])).not.toContain(HAPPEN_A);
  });
});

describe("what a character keeps", () => {
  it("reads the kind the character named", () => {
    expect(parseTurnAnswer("SAYS: Fine.\nREMEMBERS: promise: I said I would wait.").remembered).toEqual([{ kind: "promise", body: "I said I would wait." }]);
  });

  it("keeps a memory with no kind as an event rather than losing it", () => {
    expect(parseTurnAnswer("SAYS: Fine.\nREMEMBERS: The stranger had my mother's ring.").remembered).toEqual([{ kind: "event", body: "The stranger had my mother's ring." }]);
  });

  it("does not mistake a sentence with a colon for a kind", () => {
    expect(parseTurnAnswer("SAYS: Fine.\nREMEMBERS: Odd: the stranger knew my name.").remembered).toEqual([{ kind: "event", body: "Odd: the stranger knew my name." }]);
  });

  it("keeps nothing when the character says there is nothing to keep", () => {
    expect(parseTurnAnswer("SAYS: Fine.\nREMEMBERS: -").remembered).toEqual([]);
    expect(parseTurnAnswer("SAYS: Fine.").remembered).toEqual([]);
  });

  it("never lets the memory line leak into the words the player hears", () => {
    expect(parseTurnAnswer("SAYS: Fine.\nREMEMBERS: deceived: I lied about the key.").said).toBe("Fine.");
  });

  it("cuts a runaway memory to what the ledger takes", () => {
    const got = parseTurnAnswer(`REMEMBERS: event: ${"x".repeat(900)}`).remembered;
    expect(got[0].body.length).toBe(500);
  });

  it("files nothing for someone with no record: there is no ledger to keep it in", async () => {
    const kept: unknown[] = [];
    const r = recorder(["SAYS: Sweep.\nREMEMBERS: event: A stranger came."]);
    const tools = makeSpeechTools({ stored: [], loadSpeaker: async () => null, callModel: r.callModel, onRemember: (m) => kept.push(m) });
    await tools.call("speak", { speaker_name: "The sweeper", happening: "A stranger enters." });
    expect(kept).toEqual([]);
  });

  it("files nothing when the character neither spoke nor acted", async () => {
    const kept: unknown[] = [];
    const r = recorder(["DOES: -\nSAYS: -\nREMEMBERS: event: Something."]);
    const tools = makeSpeechTools({
      stored: [],
      loadSpeaker: async () => ({ id: A, shownName: "Mira", profile: "p", memories: "" }),
      callModel: r.callModel,
      onRemember: (m) => kept.push(m),
    });
    await tools.call("speak", { speaker_id: A, happening: "Nothing much." });
    expect(kept).toEqual([]);
  });
});

describe("which recorded character a bare name means", () => {
  const honeycomb = { id: A, shownName: "Apprentice Honeycomb" };
  const cantor = { id: B, shownName: "Master Cantor" };

  it("finds the one whose shown name holds the name, or 'Honeycomb' would be played without her memories", () => {
    expect(pickRecorded("Honeycomb", [honeycomb, cantor])).toEqual(honeycomb);
    expect(pickRecorded("apprentice honeycomb", [honeycomb])).toEqual(honeycomb);
  });

  it("names nobody when two characters fit, rather than putting words in the wrong mouth", () => {
    expect(pickRecorded("Master", [cantor, { id: A, shownName: "Master Nougatine" }])).toBeNull();
  });

  it("prefers the exact name over one that merely contains it", () => {
    const comb = { id: B, shownName: "Honeycomb" };
    expect(pickRecorded("Honeycomb", [honeycomb, comb])).toEqual(comb);
  });

  it("does not match part of a word: 'Honey' is not Honeycomb", () => {
    expect(pickRecorded("Honey", [honeycomb])).toBeNull();
  });

  it("lets a truly nameless creature through", () => {
    expect(pickRecorded("The sweeper", [honeycomb, cantor])).toBeNull();
  });

  it("still lets a character speak when the lookup itself fails", async () => {
    const r = recorder(["SAYS: Sweep."]);
    const tools = makeSpeechTools({
      stored: [], loadSpeaker: async () => null, callModel: r.callModel,
      findRecorded: async () => { throw new Error("db down"); },
    });
    const got = await tools.call("speak", { speaker_name: "The sweeper", happening: "A stranger enters." });
    expect(got.isError).toBe(false);
  });
});

describe("a moment that leaves more than one thing to keep", () => {
  const answer = "SAYS: Thank you.\nREMEMBERS: promise: The ledger before dusk.\nREMEMBERS: event: I hold their silver thimble.";

  it("keeps each of them, or the character forgets the pledge it is holding", () => {
    expect(parseTurnAnswer(answer).remembered).toEqual([
      { kind: "promise", body: "The ledger before dusk." },
      { kind: "event", body: "I hold their silver thimble." },
    ]);
  });

  it("stops at three, so a character cannot write a diary every turn", () => {
    const many = Array.from({ length: 6 }, (_, i) => `REMEMBERS: event: Thing ${i}.`).join("\n");
    expect(parseTurnAnswer(many).remembered).toHaveLength(3);
  });

  it("files every one of them for a recorded character", async () => {
    const kept: unknown[] = [];
    const r = recorder([answer]);
    const tools = makeSpeechTools({
      stored: [],
      loadSpeaker: async () => ({ id: A, shownName: "Mira", profile: "p", memories: "" }),
      callModel: r.callModel,
      onRemember: (m) => kept.push(m),
    });
    await tools.call("speak", { speaker_id: A, happening: "A pledge is given." });
    expect(kept).toHaveLength(2);
  });
});

describe("the people listening get a say of their own", () => {
  const C = "33333333-3333-4333-8333-333333333333";
  const people = async (id: string) => {
    if (id === A) return { id: A, shownName: "Alda", profile: "Name: Alda\nNotes: ALDA-SECRET", memories: "" };
    if (id === B) return { id: B, shownName: "Bren", profile: "Name: Bren", memories: "" };
    if (id === C) return { id: C, shownName: "Cole", profile: "Name: Cole", memories: "" };
    return null;
  };
  const silent = "DOES: -\nSAYS: -";

  it("lets a listener answer unasked, after the speaker, or a room of three is three interviews", async () => {
    const rec = recorder(["SAYS: The door is safe.", "SAYS: Alda, it is not.\nWANT: 4"]);
    const t = makeSpeechTools({ stored: [], loadSpeaker: people, callModel: rec.callModel });
    const got = await t.call("speak", { speaker_id: A, happening: "NARRATOR-BRIEF", present: [B] });
    expect(got.lines?.map((l) => `${l.speaker.name}: ${l.text}`)).toEqual(["Alda: The door is safe.", "Bren: Alda, it is not."]);
    expect(JSON.parse(got.content).exchange.map((x: { who: string }) => x.who)).toEqual(["Alda", "Bren"]);
  });

  it("tells the listener only what they heard: none of the narrator's briefing, none of the speaker's record", async () => {
    const rec = recorder(["SAYS: The door is safe.", silent]);
    const t = makeSpeechTools({ stored: [], loadSpeaker: people, callModel: rec.callModel });
    await t.call("speak", { speaker_id: A, happening: "NARRATOR-BRIEF", present: [B] });
    const asked = JSON.stringify(rec.requests[1]);
    expect(asked).toContain("The door is safe.");
    expect(asked).not.toContain("NARRATOR-BRIEF");
    expect(asked).not.toContain("ALDA-SECRET");
  });

  it("adds no line for a listener who stays silent, and still counts the call that asked them", async () => {
    const rec = recorder(["SAYS: Hello.", silent]);
    const t = makeSpeechTools({ stored: [], loadSpeaker: people, callModel: rec.callModel });
    const got = await t.call("speak", { speaker_id: A, happening: "h", present: [B] });
    expect(got.lines).toHaveLength(1);
    expect(got.usage).toHaveLength(2);
    expect(JSON.parse(got.content).exchange).toHaveLength(1);
  });

  it("asks nobody who was not listening, and nobody without a record", async () => {
    const rec = recorder(["SAYS: Hello."]);
    const t = makeSpeechTools({ stored: [], loadSpeaker: people, callModel: rec.callModel });
    await t.call("speak", { speaker_id: A, happening: "h", present: ["The sweeper"] });
    expect(rec.requests).toHaveLength(1);
  });

  it("does not let a whisper be answered by someone it was not whispered to", async () => {
    const rec = recorder(["SAYS: The key is in the well."]);
    const t = makeSpeechTools({ stored: [], loadSpeaker: people, callModel: rec.callModel });
    await t.call("speak", { speaker_id: A, happening: "h", volume: "whisper", whispered_to: [C], present: [B, C] });
    // Alda, and Cole who heard it. Bren only saw a whisper pass and is not asked what he thinks of it.
    expect(rec.requests).toHaveLength(2);
    expect(JSON.stringify(rec.requests[1])).toContain("Cole");
  });

  it("does not wake each other when two characters are asked in the same round", async () => {
    const rec = recorder(["SAYS: One.", "SAYS: Two."]);
    const t = makeSpeechTools({ stored: [], loadSpeaker: people, callModel: rec.callModel });
    await Promise.all([
      t.call("speak", { speaker_id: A, happening: "h", present: [B] }),
      t.call("speak", { speaker_id: B, happening: "h", present: [A] }),
    ]);
    expect(rec.requests).toHaveLength(2);
  });

  it("gives everyone one say: a reaction wakes no further reactions", async () => {
    const rec = recorder(["SAYS: Hello.", "SAYS: Alda, no.\nWANT: 5", "SAYS: Alda, yes.\nWANT: 5"]);
    const t = makeSpeechTools({ stored: [], loadSpeaker: people, callModel: rec.callModel });
    await t.call("speak", { speaker_id: A, happening: "h", present: [B, C] });
    expect(rec.requests).toHaveLength(3);
  });

  it("asks a listener once a turn, however many people speak in front of them", async () => {
    const rec = recorder(["SAYS: Hello.", silent, "SAYS: Good day."]);
    const t = makeSpeechTools({ stored: [], loadSpeaker: people, callModel: rec.callModel });
    await t.call("speak", { speaker_id: A, happening: "h", present: [B] });
    await t.call("speak", { speaker_id: C, happening: "h", present: [B] });
    // Alda, Bren asked once, Cole. Without the rule Bren is asked again after Cole.
    expect(rec.requests).toHaveLength(3);
  });

  it("asks at most three listeners, so a crowd does not all answer at once", async () => {
    const ids = ["44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555", "66666666-6666-4666-8666-666666666666", "77777777-7777-4777-8777-777777777777"];
    const rec = recorder(["SAYS: Hello.", silent, silent, silent, silent]);
    const t = makeSpeechTools({
      stored: [], callModel: rec.callModel,
      loadSpeaker: async (id) => (id === A ? people(A) : { id, shownName: `P${id[0]}`, profile: "p", memories: "" }),
    });
    await t.call("speak", { speaker_id: A, happening: "h", present: ids });
    expect(rec.requests).toHaveLength(4);
  });

  it("keeps what a listener chose to remember, and counts them as having been there", async () => {
    const kept: unknown[] = [];
    const there: string[] = [];
    const rec = recorder(["SAYS: I am the heir.", "SAYS: Are you now.\nWANT: 4\nREMEMBERS: learned: Alda claims to be the heir."]);
    const t = makeSpeechTools({ stored: [], loadSpeaker: people, callModel: rec.callModel, onRemember: (m) => kept.push(m), onSpoke: (id) => there.push(id) });
    await t.call("speak", { speaker_id: A, happening: "h", present: [B] });
    expect(kept).toEqual([{ characterId: B, kind: "learned", body: "Alda claims to be the heir." }]);
    expect(there).toEqual([A, B]);
  });

  it("still gives the speaker's line when a listener cannot be asked", async () => {
    let calls = 0;
    const t = makeSpeechTools({
      stored: [], loadSpeaker: people,
      callModel: async () => {
        calls++;
        if (calls === 2) throw new Error("provider down");
        return step("SAYS: Hello.");
      },
    });
    const got = await t.call("speak", { speaker_id: A, happening: "h", present: [B] });
    expect(got.isError).toBe(false);
    expect(got.lines).toHaveLength(1);
  });
});

