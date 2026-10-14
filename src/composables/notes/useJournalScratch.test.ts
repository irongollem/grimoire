import { describe, expect, it } from "vitest";
import { readScratch, scratchKey, writeScratch } from "./useJournalScratch";

function memory(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    key: (i) => Array.from(m.keys())[i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
  };
}

const doc = (text: string) =>
  JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

describe("journal scratch pad storage", () => {
  it("keys per user and per campaign", () => {
    expect(scratchKey("u1", "c1")).not.toBe(scratchKey("u1", "c2"));
    expect(scratchKey("u1", "c1")).not.toBe(scratchKey("u2", "c1"));
  });

  it("reads back what was written", () => {
    const s = memory();
    writeScratch(s, "k", doc("a clue"));
    expect(readScratch(s, "k")).toBe(doc("a clue"));
  });

  it("removes the key when the pad is blank", () => {
    const s = memory();
    writeScratch(s, "k", doc("x"));
    writeScratch(s, "k", "");
    expect(s.getItem("k")).toBeNull();
    expect(readScratch(s, "k")).toBe("");
  });

  it("treats an empty rich text document as blank", () => {
    const s = memory();
    s.setItem("k", JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }));
    expect(readScratch(s, "k")).toBe("");
  });

  it("survives storage that throws", () => {
    const s = memory();
    s.getItem = () => {
      throw new Error("denied");
    };
    s.setItem = () => {
      throw new Error("full");
    };
    expect(readScratch(s, "k")).toBe("");
    expect(() => writeScratch(s, "k", doc("x"))).not.toThrow();
  });
});
