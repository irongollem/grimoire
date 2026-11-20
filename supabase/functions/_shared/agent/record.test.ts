import { describe, expect, it } from "vitest";
import { makeRecordTool, parseRecordInput, recordSection, RECORD_SECTION_MAX, type RecordInput, type RecordedFact } from "./record";

const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";

const fact = (n: number, over: Partial<RecordedFact> = {}): RecordedFact => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  body: `Fact number ${n}.`,
  hidden: false,
  when: null,
  ...over,
});

describe("parseRecordInput", () => {
  it("refuses a missing or blank fact, or the narrator files an empty sentence", () => {
    expect(parseRecordInput({})).toMatchObject({ ok: false });
    expect(parseRecordInput({ fact: "   " })).toMatchObject({ ok: false });
  });

  it("refuses a fact over 300 characters but takes exactly 300, after trimming", () => {
    expect(parseRecordInput({ fact: ` ${"a".repeat(300)} ` })).toMatchObject({ ok: true });
    expect(parseRecordInput({ fact: "a".repeat(301) })).toMatchObject({ ok: false });
  });

  it("refuses an about entry with an unknown type or an id that is not a uuid", () => {
    expect(parseRecordInput({ fact: "x", about: [{ type: "weather", id: A }] })).toMatchObject({ ok: false });
    expect(parseRecordInput({ fact: "x", about: [{ type: "npc", id: "honeycomb" }] })).toMatchObject({ ok: false });
    expect(parseRecordInput({ fact: "x", about: ["npc"] })).toMatchObject({ ok: false });
  });

  it("refuses about that is not a list or holds more than 8, and takes exactly 8", () => {
    const entry = (n: number) => ({ type: "npc", id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}` });
    expect(parseRecordInput({ fact: "x", about: "npc" })).toMatchObject({ ok: false });
    expect(parseRecordInput({ fact: "x", about: Array.from({ length: 9 }, (_, i) => entry(i)) })).toMatchObject({ ok: false });
    expect(parseRecordInput({ fact: "x", about: Array.from({ length: 8 }, (_, i) => entry(i)) })).toMatchObject({ ok: true });
  });

  it("collapses the same thing named twice, or one tie is written twice", () => {
    const r = parseRecordInput({ fact: "x", about: [{ type: "npc", id: A }, { type: "npc", id: A.toUpperCase() }, { type: "item", id: A }] });
    expect(r).toMatchObject({ ok: true, value: { about: [{ type: "npc", id: A }, { type: "item", id: A }] } });
  });

  it("refuses hidden that is not a boolean, rather than reading the string \"false\" as true", () => {
    expect(parseRecordInput({ fact: "x", hidden: "false" })).toMatchObject({ ok: false });
    expect(parseRecordInput({ fact: "x", hidden: true })).toMatchObject({ ok: true, value: { hidden: true } });
    expect(parseRecordInput({ fact: "x" })).toMatchObject({ ok: true, value: { hidden: false, about: [], closes: null } });
  });

  it("refuses closes that is not a uuid", () => {
    expect(parseRecordInput({ fact: "x", closes: "the old fact" })).toMatchObject({ ok: false });
    expect(parseRecordInput({ fact: "x", closes: B })).toMatchObject({ ok: true, value: { closes: B } });
  });
});

describe("recordSection", () => {
  it("says nothing is on record, instead of an empty list, when there are no facts", () => {
    const text = recordSection([]);
    expect(text).toContain("## On record");
    expect(text).toContain("Nothing is on record");
  });

  it("shows each fact with its id so it can be closed, the sitting, and a hidden mark only on the hidden one", () => {
    const text = recordSection([fact(1, { when: "Session 3" }), fact(2, { hidden: true, body: "The duke is the lich." })]);
    const lines = text.split("\n");
    const known = lines.find((l) => l.includes("Fact number 1."))!;
    const secret = lines.find((l) => l.includes("The duke is the lich."))!;
    expect(known).toContain(fact(1).id);
    expect(known).toContain("Session 3");
    expect(known).not.toContain("hidden");
    expect(secret).toContain("hidden");
  });

  it("keeps the newest 30 in order and says how many older ones are not shown", () => {
    const facts = Array.from({ length: RECORD_SECTION_MAX + 2 }, (_, i) => fact(i + 1));
    const text = recordSection(facts);
    expect(text).toContain("2 older facts are not shown");
    expect(text).not.toContain("Fact number 1.");
    expect(text).not.toContain("Fact number 2.");
    expect(text.indexOf("Fact number 3.")).toBeLessThan(text.indexOf("Fact number 32."));
  });

  it("says nothing is cut when exactly 30 fit", () => {
    const text = recordSection(Array.from({ length: RECORD_SECTION_MAX }, (_, i) => fact(i + 1)));
    expect(text).not.toContain("not shown");
    expect(text).toContain("Fact number 1.");
  });
});

describe("makeRecordTool", () => {
  const harness = (answer: { id: string } | { error: string }) => {
    const filed: RecordInput[] = [];
    const announced: Array<{ id: string; body: string; hidden: boolean }> = [];
    const bound = makeRecordTool({
      fileFact: async (input) => {
        filed.push(input);
        return answer;
      },
      onFiled: (f) => announced.push(f),
    });
    return { filed, announced, bound };
  };

  it("files a good fact, answers with its id and announces it", async () => {
    const { filed, announced, bound } = harness({ id: B });
    const answer = await bound.call({ fact: "Wren holds the brass key.", about: [{ type: "item", id: A }], hidden: true });
    expect(answer.isError).toBe(false);
    expect(answer.content).toContain(B);
    expect(filed[0]).toMatchObject({ fact: "Wren holds the brass key.", hidden: true });
    expect(announced).toEqual([{ id: B, body: "Wren holds the brass key.", hidden: true }]);
  });

  it("answers an error with the sentence from filing, and announces nothing", async () => {
    const { announced, bound } = harness({ error: "The fact to close was not found." });
    const answer = await bound.call({ fact: "x", closes: A });
    expect(answer).toEqual({ content: "The fact to close was not found.", isError: true });
    expect(announced).toEqual([]);
  });

  it("files nothing for input it refuses", async () => {
    const { filed, announced, bound } = harness({ id: B });
    const answer = await bound.call({ fact: "" });
    expect(answer.isError).toBe(true);
    expect(filed).toEqual([]);
    expect(announced).toEqual([]);
  });
});

describe("makeRecordTool and the canon check (#1226)", () => {
  const withCheck = (check: (input: RecordInput) => Promise<{ error: string } | null>) => {
    const filed: RecordInput[] = [];
    const announced: unknown[] = [];
    const bound = makeRecordTool({
      check,
      fileFact: async (input) => {
        filed.push(input);
        return { id: B };
      },
      onFiled: (f) => announced.push(f),
    });
    return { filed, announced, bound };
  };

  it("answers a refusal with its reason, and files and announces nothing", async () => {
    const { filed, announced, bound } = withCheck(async () => ({ error: "It contradicts a truth: magic leaves a taste on the tongue." }));
    const answer = await bound.call({ fact: "Magic leaves no trace at all." });
    expect(answer).toEqual({ content: "It contradicts a truth: magic leaves a taste on the tongue.", isError: true });
    expect(filed).toEqual([]);
    expect(announced).toEqual([]);
  });

  it("files a fact the check lets stand", async () => {
    const { filed, bound } = withCheck(async () => null);
    expect((await bound.call({ fact: "Wren holds the brass key." })).isError).toBe(false);
    expect(filed).toHaveLength(1);
  });

  it("holds the parsed fact against the check, not the raw input", async () => {
    const seen: RecordInput[] = [];
    const { bound } = withCheck(async (input) => {
      seen.push(input);
      return null;
    });
    await bound.call({ fact: "  Wren holds the brass key.  " });
    expect(seen[0].fact).toBe("Wren holds the brass key.");
  });

  it("does not run the check for input it already refused", async () => {
    let asked = 0;
    const { bound } = withCheck(async () => {
      asked++;
      return null;
    });
    await bound.call({ fact: "" });
    expect(asked).toBe(0);
  });

  it("files the fact when the check itself throws, rather than losing it", async () => {
    const { filed, bound } = withCheck(async () => {
      throw new Error("judge down");
    });
    expect((await bound.call({ fact: "Wren holds the brass key." })).isError).toBe(false);
    expect(filed).toHaveLength(1);
  });
});

