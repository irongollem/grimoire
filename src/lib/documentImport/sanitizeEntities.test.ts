import { describe, expect, it } from "vitest";
import { sanitizeEntities } from "./sanitizeEntities";

describe("sanitizeEntities", () => {
  it("returns nothing for a non-array value", () => {
    expect(sanitizeEntities(undefined, "name")).toEqual({ entities: [], dropped: 0 });
    expect(sanitizeEntities(null, "name")).toEqual({ entities: [], dropped: 0 });
    expect(sanitizeEntities("not an array", "name")).toEqual({ entities: [], dropped: 0 });
  });

  it("returns nothing for an empty array", () => {
    expect(sanitizeEntities([], "name")).toEqual({ entities: [], dropped: 0 });
  });

  it("drops non-object entries", () => {
    const { entities, dropped } = sanitizeEntities([null, 1, "x", true], "name");
    expect(entities).toHaveLength(0);
    expect(dropped).toBe(4);
  });

  it("drops entries with a missing or malformed data object", () => {
    const { entities, dropped } = sanitizeEntities(
      [{ ref: "a" }, { ref: "b", data: "nope" }, { ref: "c", data: ["nope"] }],
      "name",
    );
    expect(entities).toHaveLength(0);
    expect(dropped).toBe(3);
  });

  it("drops entries whose heading field is missing, blank, or non-string", () => {
    const { entities, dropped } = sanitizeEntities(
      [{ ref: "a", data: {} }, { ref: "b", data: { name: "   " } }, { ref: "c", data: { name: 5 } }],
      "name",
    );
    expect(entities).toHaveLength(0);
    expect(dropped).toBe(3);
  });

  it("keeps well-formed entries and reports zero dropped", () => {
    const { entities, dropped } = sanitizeEntities(
      [
        { ref: "a", page: 3, confidence: "partial", data: { name: "Kobold" } },
        { ref: "b", page: null, confidence: "complete", data: { name: "Owlbear" } },
      ],
      "name",
    );
    expect(dropped).toBe(0);
    expect(entities).toEqual([
      { ref: "a", page: 3, confidence: "partial", data: { name: "Kobold" } },
      { ref: "b", page: null, confidence: "complete", data: { name: "Owlbear" } },
    ]);
  });

  it("mints a ref when one is missing or blank", () => {
    const { entities } = sanitizeEntities([{ data: { name: "Kobold" } }, { ref: "", data: { name: "Owlbear" } }], "name");
    expect(entities).toHaveLength(2);
    expect(entities[0]!.ref.length).toBeGreaterThan(0);
    expect(entities[1]!.ref.length).toBeGreaterThan(0);
    expect(entities[0]!.ref).not.toBe(entities[1]!.ref);
  });

  it("defaults page to null and confidence to complete when malformed", () => {
    const { entities } = sanitizeEntities(
      [{ ref: "a", page: "three", confidence: "unsure", data: { name: "Kobold" } }],
      "name",
    );
    expect(entities[0]).toEqual({ ref: "a", page: null, confidence: "complete", data: { name: "Kobold" } });
  });

  it("reads title as the heading field when asked", () => {
    const { entities, dropped } = sanitizeEntities([{ ref: "a", data: { title: "The Sunken Bell" } }], "title");
    expect(dropped).toBe(0);
    expect(entities[0]?.data.title).toBe("The Sunken Bell");
  });
});
