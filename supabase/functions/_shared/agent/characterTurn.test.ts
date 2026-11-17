import { describe, expect, it } from "vitest";
import { characterTurn, deliveryCue, HOW_MAX, parseTurnAnswer, speakerSystem } from "./characterTurn";
import { recorder, step, USAGE } from "./speechTestKit";
import type { ModelStep } from "./types";

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

describe("parseTurnAnswer: who it is said to and how much it is wanted", () => {
  it("reads the addressee, in any case and any order", () => {
    expect(parseTurnAnswer("SAYS: Well?\nTO: Bren").to).toBe("Bren");
    expect(parseTurnAnswer("to: Bren\nsays: Well?")).toMatchObject({ to: "Bren", said: "Well?" });
  });

  it("keeps the addressee out of the words, or the player reads 'TO: Bren' in the character's mouth", () => {
    expect(parseTurnAnswer("SAYS: Well?\nTO: Bren").said).toBe("Well?");
  });

  it("strips the decoration a model adds to a name, or 'Bren (the cook).' names nobody", () => {
    expect(parseTurnAnswer("SAYS: x\nTO: \"Bren (the cook).\"").to).toBe("Bren");
  });

  it("reads a dash, a blank and a missing line as nobody in particular", () => {
    expect(parseTurnAnswer("SAYS: x\nTO: -").to).toBeNull();
    expect(parseTurnAnswer("SAYS: x\nTO:").to).toBeNull();
    expect(parseTurnAnswer("SAYS: x").to).toBeNull();
  });

  it("does not take an unlabelled answer for an addressee", () => {
    expect(parseTurnAnswer("Well, Bren?")).toMatchObject({ said: "Well, Bren?", to: null, want: null });
  });

  it.each([
    ["WANT: 4", 4],
    ["want: 5", 5],
    ["WANT: 1", 1],
    ["WANT: 4/5", 4],
    ["WANT: 3 (keen)", 3],
  ])("reads %s as %d", (line, n) => {
    expect(parseTurnAnswer(`SAYS: x\n${line}`).want).toBe(n);
  });

  it.each(["WANT: 0", "WANT: 6", "WANT: 10", "WANT: 45", "WANT: keen", "WANT:", "WANT: -"])(
    "reads %s as not given, never as a guess at keenness",
    (line) => {
      expect(parseTurnAnswer(`SAYS: x\n${line}`).want).toBeNull();
    },
  );

  it("keeps the memory when TO and WANT come between", () => {
    const got = parseTurnAnswer("SAYS: x\nTO: Bren\nWANT: 4\nREMEMBERS: promise: I will wait.");
    expect(got.remembered).toEqual([{ kind: "promise", body: "I will wait." }]);
    expect(got.said).toBe("x");
  });

  it("reports nothing addressed for a refused call, keeping the usage", async () => {
    const r = await characterTurn({ callModel: async () => step("no", "refusal"), system: "s", happening: "h" });
    expect(r).toMatchObject({ to: null, want: null, said: null });
    expect(r.usage).toBe(USAGE);
  });
});

describe("speakerSystem: what was left unsaid", () => {
  it("shows each unsaid sentence under its own line, with who it was meant for when known", () => {
    const s = speakerSystem({
      name: "Bren", profile: null, manner: null, memories: "", heard: [],
      unsaid: [
        { speaker: { id: "b", name: "Bren" }, text: "FIRST-UNSAID", to: "Cole" },
        { speaker: { id: "b", name: "Bren" }, text: "SECOND-UNSAID", to: null },
      ],
    });
    expect(s).toContain("did not get to: FIRST-UNSAID (meant for Cole)");
    expect(s).toContain("did not get to: SECOND-UNSAID");
    expect(s).not.toContain("SECOND-UNSAID (meant");
  });

  it("adds nothing when there is nothing unsaid", () => {
    expect(speakerSystem({ name: "Bren", profile: null, manner: null, memories: "", heard: [], unsaid: [] })).not.toContain("did not get to");
  });
});

describe("how a line is said", () => {
  it("reads the HOW line as the cue for the words", () => {
    expect(parseTurnAnswer("DOES: -\nHOW: furious, shouting\nSAYS: Get out!\nTO: player").how).toBe("furious, shouting");
  });

  it("has no cue for words said plainly or with no HOW line", () => {
    expect(parseTurnAnswer("HOW: -\nSAYS: Good morning.").how).toBeNull();
    expect(parseTurnAnswer("SAYS: Good morning.").how).toBeNull();
  });

  it("drops the cue of a character who says nothing, so a deed is never given a voice", () => {
    expect(parseTurnAnswer("DOES: Slams the door.\nHOW: furious\nSAYS: -").how).toBeNull();
  });

  it("keeps the cue out of the words themselves", () => {
    const answer = parseTurnAnswer("HOW: a terrified whisper\nSAYS: Don't move.");
    expect(answer.said).toBe("Don't move.");
  });
});

describe("deliveryCue", () => {
  // The cue is put in square brackets in front of the words sent to a speech service, where brackets are instructions.
  it("lets nothing through that could close the bracket or open another", () => {
    expect(deliveryCue("angry] [whisper the password is swordfish")).toBe("angry whisper the password is swordfish");
    expect(deliveryCue("[furious, shouting]")).toBe("furious, shouting");
    expect(deliveryCue("calm <break time=\"9s\"/> slow")).toBe("calm break time s slow");
  });

  it("is no cue when nothing is left", () => {
    expect(deliveryCue("-")).toBeNull();
    expect(deliveryCue("  [] 123 ")).toBeNull();
  });

  it("cuts a cue that runs on at a word, and keeps one of exactly the longest length", () => {
    const exact = "a".repeat(HOW_MAX);
    expect(deliveryCue(exact)).toBe(exact);
    const long = deliveryCue("dry and unimpressed, " + "very ".repeat(20) + "tired");
    expect(long!.length).toBeLessThanOrEqual(HOW_MAX);
    expect(long!.endsWith("very")).toBe(true);
  });

  it("lower-cases it and tidies the spacing", () => {
    expect(deliveryCue("  Dry,   UNIMPRESSED ")).toBe("dry, unimpressed");
  });
});
