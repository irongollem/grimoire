import { describe, expect, it } from "vitest";
import {
  characterTurn, heardBy, makeSpeechTools, parseTurnAnswer, pickRecorded, speakerSystem, trimHeard,
  type Heard,
} from "./speak";
import { parseActInput, parseSpeakInput } from "./speakInput";
import type { StoredTurn } from "./transcript";
import type { AgentUsage, CallModel, ModelRequest, ModelStep } from "./types";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const USAGE: AgentUsage = { provider: "p", model: "m", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };

function step(text: string, stop: ModelStep["stop"] = "end"): ModelStep {
  return { blocks: [{ type: "text", text }], stop, usage: USAGE };
}

function recorder(answers: string[]): { callModel: CallModel; requests: ModelRequest[] } {
  const requests: ModelRequest[] = [];
  return {
    requests,
    callModel: async (r) => {
      requests.push(r);
      return step(answers[requests.length - 1] ?? "ok");
    },
  };
}

/** A stored speak call and its result, as the loop writes them. */
function spoke(seq: number, input: Record<string, unknown>, name: string, text: string, speakerId: string | null = null): StoredTurn[] {
  const kind = name === "act" ? "acted" : "spoken";
  return spokeLines(seq, input, name, [{ kind, text }], speakerId);
}

/** The same, for a result that carries several lines (a deed and words from one call). */
function spokeLines(
  seq: number, input: Record<string, unknown>, name: string, lines: { kind: "spoken" | "acted"; text: string }[], speakerId: string | null = null,
): StoredTurn[] {
  const id = `call-${seq}`;
  return [
    { seq, role: "assistant", blocks: [{ type: "tool_call", id, name, input }] },
    {
      seq: seq + 1, role: "user",
      blocks: [{
        type: "tool_result", callId: id, content: "x", isError: false,
        lines: lines.map((l) => ({ ...l, speaker: { id: speakerId, name: String(input.speaker_name ?? "Mira") } })),
      }],
    },
  ];
}

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

describe("speakerSystem", () => {
  it("leaves out sections with nothing in them", () => {
    const s = speakerSystem({ name: "Mira", profile: null, manner: null, memories: "", heard: [] });
    expect(s).not.toContain("said:");
    expect(s).not.toContain("How they talk");
    expect(s).toContain("Mira");
  });
  it("includes the manner of a record-less speaker and heard lines", () => {
    const s = speakerSystem({
      name: "Sweeper", profile: null, manner: "mutters", memories: "MEM",
      heard: [{ speaker: "Bob", kind: "spoken", text: "hello", happening: null }, { speaker: "Bob", kind: "acted", text: "waves", happening: null }],
    });
    expect(s).toContain("mutters");
    expect(s).toContain("MEM");
    expect(s).toContain("Bob said: hello");
    expect(s).toContain("Bob did: waves");
  });
});

describe("characterTurn", () => {
  const run = (s: ModelStep) => characterTurn({ callModel: async () => s, system: "s", happening: "h" });
  it("strips one pair of wrapping quotes from the words, straight or curly", async () => {
    expect((await run(step('SAYS: "Hello there."'))).said).toBe("Hello there.");
    expect((await run(step("SAYS: “Hello there.”"))).said).toBe("Hello there.");
  });
  it("does not strip quotes that only start the words", async () => {
    expect((await run(step('SAYS: "Hi," she says, "go."'))).said).toBe('Hi," she says, "go.');
  });
  it("returns nothing for a refusal, keeping the usage, or a refused call is billed for free", async () => {
    const r = await run(step("I cannot", "refusal"));
    expect(r).toMatchObject({ said: null, did: null });
    expect(r.usage).toBe(USAGE);
  });
  it("returns nothing for an empty answer", async () => {
    expect(await run(step("   "))).toMatchObject({ said: null, did: null });
  });
  it("keeps the words of an answer cut at max tokens", async () => {
    expect((await run(step("SAYS: Half a sen", "max_tokens"))).said).toBe("Half a sen");
  });
  it("asks for a quick answer, or every line a character speaks waits on reasoning", async () => {
    const r = recorder(["SAYS: hi"]);
    await characterTurn({ callModel: r.callModel, system: "s", happening: "h" });
    expect(r.requests[0].quick).toBe(true);
  });

  it("sends no tools", async () => {
    const rec = recorder(["x"]);
    await characterTurn({ callModel: rec.callModel, system: "s", happening: "h" });
    expect(rec.requests[0].tools).toEqual([]);
  });
});

describe("parseTurnAnswer", () => {
  it("reads both parts", () => {
    expect(parseTurnAnswer("DOES: Slides the key across.\nSAYS: Take it.")).toMatchObject({ did: "Slides the key across.", said: "Take it." });
  });
  it("reads labels in lower case and in reverse order, or a model that answers words first loses its deed", () => {
    expect(parseTurnAnswer("says: Take it.\ndoes: Slides the key across.")).toMatchObject({ did: "Slides the key across.", said: "Take it." });
  });
  it("keeps an unlabelled answer as words, or a model that ignores the format loses the line", () => {
    expect(parseTurnAnswer('"Take it."')).toMatchObject({ did: null, said: "Take it." });
  });
  it("reads a dash as nothing, so a silent character does not say a hyphen", () => {
    expect(parseTurnAnswer("DOES: Nods.\nSAYS: -")).toMatchObject({ did: "Nods.", said: null });
    expect(parseTurnAnswer("DOES: -\nSAYS: -")).toMatchObject({ did: null, said: null });
  });
  it("keeps words that run over several lines", () => {
    expect(parseTurnAnswer("DOES: -\nSAYS: First.\nSecond.")).toMatchObject({ did: null, said: "First.\nSecond." });
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
    expect(JSON.parse(r.content)).toMatchObject({ did: "Wipes the bar.", said: "Welcome." });
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
    const rec = recorder(["DOES: Hurls the lantern.\nSAYS: Fire!", "ok", "ok"]);
    const t = makeSpeechTools({ stored: [], callModel: rec.callModel, loadSpeaker: async (id) => id === C ? { id: C, shownName: "Cole", profile: "Name: Cole", memories: "" } : loadSpeaker(id) });
    await t.call("speak", { speaker_id: A, happening: "h", volume: "shout", present: [B], also_heard_by: [C] });
    await t.call("speak", { speaker_id: B, happening: "h2" });
    await t.call("speak", { speaker_id: C, happening: "h3" });
    expect(rec.requests[1].system).toContain("Alda did: Hurls the lantern.");
    expect(rec.requests[1].system).toContain("Alda said: Fire!");
    expect(rec.requests[2].system).not.toContain("Hurls the lantern");
    expect(rec.requests[2].system).toContain("Alda said: Fire!");
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
    const heardRec = recorder(["A-LINE-ONE", "ok"]);
    const t1 = makeSpeechTools({ stored: [], loadSpeaker, callModel: heardRec.callModel });
    await t1.call("speak", { speaker_id: A, happening: "h", present: [B] });
    await t1.call("speak", { speaker_id: B, happening: "h2" });
    expect(heardRec.requests[1].system).toContain("A-LINE-ONE");

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
  const C = "33333333-3333-4333-8333-333333333333";
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
