import { describe, expect, it } from "vitest";
import { MEMORIES_MAX, MEMORIES_PER_CHARACTER, MEMORY_LINE_MAX, memoriesSection, type SceneMemory } from "./memories";

const mem = (npcId: string, name: string, body: string, day: number): SceneMemory => ({
  npcId,
  name,
  body,
  createdAt: `2026-11-${String(day).padStart(2, "0")}T10:00:00Z`,
});

describe("memoriesSection", () => {
  it("is absent with no memories", () => {
    expect(memoriesSection([])).toBe("");
  });

  // Bug caught: oldest first (the order the Voice Coach reads them in) put the stalest memory in front.
  it("tells the newest first, one line each, whatever order they arrive in", () => {
    const text = memoriesSection([mem("a", "Maren", "OLD", 1), mem("a", "Maren", "NEW", 9), mem("b", "Tom", "MID", 5)]);
    expect(text).toBe("## What they remember\n\nMaren remembers: NEW\nTom remembers: MID\nMaren remembers: OLD");
  });

  // Bug caught: one chatty character filled the section.
  it("keeps at most three per character, the newest three", () => {
    const rows = Array.from({ length: 6 }, (_, i) => mem("a", "Maren", `M${i + 1}`, i + 1));
    const text = memoriesSection(rows);
    expect(MEMORIES_PER_CHARACTER).toBe(3);
    expect(text).toContain("M6");
    expect(text).toContain("M4");
    expect(text).not.toContain("M3");
  });

  it("counts two characters shown under one name separately", () => {
    const rows = [1, 2, 3, 4].flatMap((d) => [mem("a", "Guard", `A${d}`, d), mem("b", "Guard", `B${d}`, d)]);
    expect(memoriesSection(rows).split("\n").filter((l) => l.startsWith("Guard"))).toHaveLength(6);
  });

  it("keeps at most twelve in all", () => {
    const rows = Array.from({ length: 8 }, (_, c) => [1, 2, 3].map((d) => mem(`n${c}`, `Npc${c}`, `T${c}-${d}`, d))).flat();
    expect(memoriesSection(rows).split("\n").filter((l) => l.includes("remembers"))).toHaveLength(MEMORIES_MAX);
  });

  it("flattens a long or multi-line memory to one short line", () => {
    const text = memoriesSection([mem("a", "Maren", `first\n\nsecond ${"x".repeat(400)}`, 1)]);
    const line = text.split("\n")[2];
    expect(line).not.toContain("\n");
    expect(line.length).toBeLessThanOrEqual("Maren remembers: ".length + MEMORY_LINE_MAX);
    expect(line.endsWith("…")).toBe(true);
    expect(memoriesSection([mem("a", "Maren", "   ", 1)])).toBe("");
  });
});
