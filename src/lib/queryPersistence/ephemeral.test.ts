import { describe, it, expect } from "vitest";
import { containsEphemeral } from "./ephemeral";

describe("containsEphemeral", () => {
  it("passes plain data", () => {
    expect(containsEphemeral({ a: 1, b: ["x", { c: null, d: undefined }] })).toBe(false);
    expect(containsEphemeral("https://cdn.example/x.png")).toBe(false);
    expect(containsEphemeral(null)).toBe(false);
  });

  it("finds a blob: url at any depth", () => {
    expect(containsEphemeral("blob:http://localhost/abc")).toBe(true);
    expect(containsEphemeral([{ a: { b: [{ url: "blob:x" }] } }])).toBe(true);
  });

  it("finds Blob, File, ArrayBuffer, typed arrays and functions", () => {
    expect(containsEphemeral({ v: new Blob(["x"]) })).toBe(true);
    expect(containsEphemeral({ v: new File(["x"], "f.txt") })).toBe(true);
    expect(containsEphemeral({ v: new ArrayBuffer(4) })).toBe(true);
    expect(containsEphemeral({ v: new Uint8Array(4) })).toBe(true);
    expect(containsEphemeral([() => 1])).toBe(true);
  });

  it("stops descending past depth 12 (and survives cycles)", () => {
    let deep: unknown = "blob:deep";
    for (let i = 0; i < 20; i++) deep = { child: deep };
    expect(containsEphemeral(deep)).toBe(false);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(containsEphemeral(cyclic)).toBe(false);
  });

  it("is cheap on a large array of flat rows", () => {
    const rows = Array.from({ length: 3500 }, (_, i) => ({ id: i, name: `n${i}`, tags: ["a"], url: "https://x" }));
    const start = performance.now();
    expect(containsEphemeral(rows)).toBe(false);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
