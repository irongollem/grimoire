import { describe, expect, it } from "vitest";
import { classifyEmbeddings } from "./embeddingAudit";

const stored = (entries: Record<string, [string, string]>) =>
  new Map(Object.entries(entries).map(([id, [source_hash, embedding_model]]) => [id, { source_hash, embedding_model }]));

describe("classifyEmbeddings", () => {
  it("reports a row with no stored embedding as missing", () => {
    expect(classifyEmbeddings([{ id: "a", hash: "h" }], stored({}), "m")).toEqual({ missing: ["a"], outdated: [] });
  });
  it("reports a changed hash as outdated", () => {
    expect(classifyEmbeddings([{ id: "a", hash: "new" }], stored({ a: ["old", "m"] }), "m")).toEqual({
      missing: [],
      outdated: ["a"],
    });
  });
  it("reports a changed model as outdated", () => {
    expect(classifyEmbeddings([{ id: "a", hash: "h" }], stored({ a: ["h", "old-model"] }), "m")).toEqual({
      missing: [],
      outdated: ["a"],
    });
  });
  it("leaves a current row out of both lists", () => {
    expect(classifyEmbeddings([{ id: "a", hash: "h" }], stored({ a: ["h", "m"] }), "m")).toEqual({
      missing: [],
      outdated: [],
    });
  });
  it("ignores stored rows that no longer have a source row", () => {
    expect(classifyEmbeddings([], stored({ gone: ["h", "m"] }), "m")).toEqual({ missing: [], outdated: [] });
  });
  it("preserves input order in each list", () => {
    const fresh = [
      { id: "c", hash: "h" },
      { id: "a", hash: "new" },
      { id: "b", hash: "h" },
      { id: "d", hash: "new" },
    ];
    const s = stored({ a: ["old", "m"], d: ["old", "m"] });
    expect(classifyEmbeddings(fresh, s, "m")).toEqual({ missing: ["c", "b"], outdated: ["a", "d"] });
  });
});
