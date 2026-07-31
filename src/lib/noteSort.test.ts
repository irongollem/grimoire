import { describe, it, expect } from "vitest";
import { compareEntities, sortEntities, type SortableEntity } from "@/lib/noteSort";

function entity(p: Partial<SortableEntity>): SortableEntity {
  return {
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    title: null,
    sort_order: null,
    ...p,
  };
}

const ids = (list: { id: string }[]) => list.map((e) => e.id);

describe("compareEntities — created", () => {
  const older = entity({ created_at: "2026-01-01T00:00:00Z" });
  const newer = entity({ created_at: "2026-02-01T00:00:00Z" });

  it("desc puts newest first", () => {
    expect(compareEntities(newer, older, "created", "desc")).toBeLessThan(0);
  });
  it("asc puts oldest first", () => {
    expect(compareEntities(older, newer, "created", "asc")).toBeLessThan(0);
  });
});

describe("compareEntities — updated", () => {
  const stale = entity({ updated_at: "2026-01-01T00:00:00Z" });
  const fresh = entity({ updated_at: "2026-03-01T00:00:00Z" });

  it("desc puts most-recently-updated first", () => {
    expect(compareEntities(fresh, stale, "updated", "desc")).toBeLessThan(0);
  });
});

describe("compareEntities — title", () => {
  it("asc is alphabetical", () => {
    const a = entity({ title: "Apple" });
    const z = entity({ title: "Zebra" });
    expect(compareEntities(a, z, "title", "asc")).toBeLessThan(0);
    expect(compareEntities(a, z, "title", "desc")).toBeGreaterThan(0);
  });

  it("empty/null titles always sink to the bottom regardless of direction", () => {
    const titled = entity({ title: "Something" });
    const blank = entity({ title: null });
    expect(compareEntities(titled, blank, "title", "asc")).toBeLessThan(0);
    expect(compareEntities(titled, blank, "title", "desc")).toBeLessThan(0);
    expect(compareEntities(blank, titled, "title", "asc")).toBeGreaterThan(0);
  });
});

describe("compareEntities — manual", () => {
  it("orders by sort_order ascending", () => {
    const first = entity({ sort_order: 0 });
    const second = entity({ sort_order: 5 });
    expect(compareEntities(first, second, "manual", "desc")).toBeLessThan(0);
  });

  it("nulls sink below ordered items", () => {
    const ordered = entity({ sort_order: 3 });
    const unordered = entity({ sort_order: null });
    expect(compareEntities(ordered, unordered, "manual", "asc")).toBeLessThan(0);
    expect(compareEntities(unordered, ordered, "manual", "asc")).toBeGreaterThan(0);
  });

  it("falls back to newest-created when both sort_orders are null", () => {
    const older = entity({ sort_order: null, created_at: "2026-01-01T00:00:00Z" });
    const newer = entity({ sort_order: null, created_at: "2026-02-01T00:00:00Z" });
    expect(compareEntities(newer, older, "manual", "asc")).toBeLessThan(0);
  });
});

describe("sortEntities", () => {
  it("does not mutate the input array", () => {
    const list = [entity({ sort_order: 2 }), entity({ sort_order: 1 })];
    const copy = [...list];
    sortEntities(list, "manual", "asc");
    expect(list).toEqual(copy);
  });

  it("produces full ordering for manual with mixed null/set sort_order", () => {
    const list = [
      { id: "c", ...entity({ sort_order: null, created_at: "2026-01-10T00:00:00Z" }) },
      { id: "a", ...entity({ sort_order: 0 }) },
      { id: "d", ...entity({ sort_order: null, created_at: "2026-01-20T00:00:00Z" }) },
      { id: "b", ...entity({ sort_order: 1 }) },
    ];
    // ordered (0,1) first, then nulls newest-created first (d before c)
    expect(ids(sortEntities(list, "manual", "asc"))).toEqual(["a", "b", "d", "c"]);
  });
});
