import { describe, expect, it } from "vitest";
import { buildBeatFillConstraints, normalizeBeatFill, type BeatFillContext } from "./beatFill";

const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const other = (title: string, lead = "") => ({ title, dm_content: lead ? doc(lead) : null });

const base = (): BeatFillContext => ({
  quest: { title: "The Drowned Bell", summary: "A bell rings under the lake." },
  beat: { kind: "explore", title: "The boathouse", dm_content: null },
  incoming: [], outgoing: [], objectives: [], stagedAt: null, threadLabel: null,
});

describe("buildBeatFillConstraints", () => {
  it("names the quest and the beat", () => {
    const lines = buildBeatFillConstraints(base());
    expect(lines[0]).toBe("Quest: The Drowned Bell — A bell rings under the lake.");
    expect(lines[1]).toContain("explore");
    expect(lines[1]).toContain("The boathouse");
  });

  it("lists neighbours with a plain-text excerpt, capped at three each", () => {
    const lines = buildBeatFillConstraints({
      ...base(),
      incoming: [other("A", "lead a"), other("B"), other("C"), other("D")],
      outgoing: [other("X"), other("Y"), other("Z"), other("W")],
    });
    expect(lines.filter((l) => l.startsWith("Comes after"))).toHaveLength(3);
    expect(lines.filter((l) => l.startsWith("Leads to"))).toHaveLength(3);
    expect(lines).toContain("Comes after: A — lead a");
    expect(lines).toContain("Comes after: B");
  });

  it("lists open objectives only, plus place and thread", () => {
    const lines = buildBeatFillConstraints({
      ...base(), stagedAt: "Lake Ward", threadLabel: "Main",
      objectives: [
        { description: "Find the bell", status: "pending" },
        { description: "Old goal", status: "complete" },
      ],
    });
    expect(lines).toContain("Staged at: Lake Ward");
    expect(lines).toContain("Story thread: Main");
    expect(lines).toContain("Open objectives: Find the bell");
  });

  it("never exceeds twelve lines of four hundred characters", () => {
    const long = "word ".repeat(300);
    const lines = buildBeatFillConstraints({
      quest: { title: long, summary: long },
      beat: { kind: "social", title: long, dm_content: doc(long) },
      incoming: Array.from({ length: 6 }, () => other(long, long)),
      outgoing: Array.from({ length: 6 }, () => other(long, long)),
      objectives: [{ description: long, status: "pending" }],
      stagedAt: long, threadLabel: long,
    });
    expect(lines.length).toBeLessThanOrEqual(12);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(400);
  });
});

describe("normalizeBeatFill", () => {
  it("trims and maps the model's fields", () => {
    expect(normalizeBeatFill({ title: " Dock ", read_aloud: " Mist. ", dm_content: " Truth. " }))
      .toEqual({ title: "Dock", readAloud: "Mist.", dmContent: "Truth." });
  });

  it("ignores non-string fields", () => {
    expect(normalizeBeatFill({ title: 4, read_aloud: ["x"], dm_content: "ok" }))
      .toEqual({ title: "", readAloud: "", dmContent: "ok" });
  });

  it("throws when nothing usable came back", () => {
    expect(() => normalizeBeatFill(null)).toThrow();
    expect(() => normalizeBeatFill("text")).toThrow();
    expect(() => normalizeBeatFill({ title: "Only a title" })).toThrow();
  });
});
