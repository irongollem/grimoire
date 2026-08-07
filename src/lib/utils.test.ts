import { describe, it, expect } from "vitest";
import { cn, deepEqual } from "./utils";

describe("cn", () => {
  // The #552 typography roles are custom `@utility` classes, so stock
  // tailwind-merge does not recognise them as font sizes and would let a
  // component default and a call-site override both survive. AppButton's
  // `class` passthrough depends on these winning cleanly.
  it("lets a call-site font size replace a semantic typography role", () => {
    expect(cn("text-label-lg px-3", "text-sm")).toBe("px-3 text-sm");
  });

  it("resolves one typography role against another", () => {
    expect(cn("text-label", "text-label-lg")).toBe("text-label-lg");
    expect(cn("text-body", "text-caption-sm")).toBe("text-caption-sm");
  });

  it("leaves non-conflicting classes alone", () => {
    expect(cn("text-label-lg px-3", "px-4")).toBe("text-label-lg px-4");
  });

  it("still resolves ordinary Tailwind conflicts", () => {
    expect(cn("bg-primary", "bg-muted")).toBe("bg-muted");
  });
});

describe("deepEqual", () => {
  it("treats identical primitives as equal", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("a", "a")).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
  });

  it("treats different primitives as unequal", () => {
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual("a", "b")).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(0, false)).toBe(false);
  });

  it("is insensitive to object key order", () => {
    const a = { name: "Owlbear", cr: "3", tags: ["beast"] };
    const b = { tags: ["beast"], cr: "3", name: "Owlbear" };
    expect(deepEqual(a, b)).toBe(true);
  });

  it("detects a changed nested value", () => {
    const a = { stat_block: { armor_class: 13, hit_points: "10 (2d8+1)" } };
    const b = { stat_block: { armor_class: 15, hit_points: "10 (2d8+1)" } };
    expect(deepEqual(a, b)).toBe(false);
  });

  it("compares arrays by content and order", () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2, 3], [3, 2, 1])).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it("distinguishes an array from an object", () => {
    expect(deepEqual([1, 2], { 0: 1, 1: 2 })).toBe(false);
  });

  it("detects an added or removed key", () => {
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(false);
  });

  it("handles deeply nested tiptap-style JSON content", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
    };
    const same = JSON.parse(JSON.stringify(doc));
    const edited = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }],
    };
    expect(deepEqual(doc, same)).toBe(true);
    expect(deepEqual(doc, edited)).toBe(false);
  });
});
