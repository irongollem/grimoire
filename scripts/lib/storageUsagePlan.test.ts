import { describe, expect, it } from "vitest";
import { countOver, groupByUser, planStorageUsage, type StoredRow } from "./storageUsagePlan.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-11-15T12:00:00Z");
const minutesAgo = (m: number): string => new Date(NOW.getTime() - m * 60_000).toISOString();
const row = (path: string, bytes: number, createdMinutesAgo: number, user = A): StoredRow => ({
  path,
  user_id: user,
  bytes,
  created_at: minutesAgo(createdMinutesAgo),
  released_at: null,
});

describe("planStorageUsage", () => {
  it("records a listed object the table does not hold, under its owner", () => {
    const plan = planStorageUsage([{ path: `${A}/a.webp`, size: 10 }], [], NOW, 60);
    expect(plan.record).toEqual([{ path: `${A}/a.webp`, userId: A, size: 10 }]);
  });

  it("re-records a row marked released whose file exists, so the total does not forget an upload that followed its delete", () => {
    const released = { ...row(`${A}/back.webp`, 10, 5), released_at: minutesAgo(4) };
    const plan = planStorageUsage([{ path: `${A}/back.webp`, size: 10 }], [released], NOW, 60);
    expect(plan.record).toEqual([{ path: `${A}/back.webp`, userId: A, size: 10 }]);
  });

  it("re-records an object whose size changed, and leaves an equal one alone", () => {
    const plan = planStorageUsage(
      [
        { path: `${A}/grown.webp`, size: 20 },
        { path: `${A}/same.webp`, size: 10 },
      ],
      [row(`${A}/grown.webp`, 10, 5), row(`${A}/same.webp`, 10, 5)],
      NOW,
      60,
    );
    expect(plan.record.map((e) => e.path)).toEqual([`${A}/grown.webp`]);
  });

  it("re-records an object whose row names a different owner", () => {
    const plan = planStorageUsage([{ path: `${A}/a.webp`, size: 10 }], [row(`${A}/a.webp`, 10, 5, B)], NOW, 60);
    expect(plan.record).toHaveLength(1);
  });

  it("never records an unowned path such as srd/", () => {
    const plan = planStorageUsage(
      [
        { path: "srd/owlbear.webp", size: 10 },
        { path: "library/x.webp", size: 10 },
      ],
      [],
      NOW,
      60,
    );
    expect(plan.record).toEqual([]);
    expect(plan.unowned).toBe(2);
    expect(plan.bytesByUser.size).toBe(0);
  });

  it("skips a zero-byte object, since the table requires bytes above zero", () => {
    const plan = planStorageUsage([{ path: `${A}/empty.webp`, size: 0 }], [], NOW, 60);
    expect(plan.record).toEqual([]);
    expect(plan.empty).toBe(1);
  });

  it("does not remove a row whose object is still listed, however old", () => {
    const plan = planStorageUsage([{ path: `${A}/a.webp`, size: 10 }], [row(`${A}/a.webp`, 10, 100000)], NOW, 60);
    expect(plan.remove).toEqual([]);
  });

  it("does not remove a zero-byte listed object's row either (the object exists)", () => {
    const plan = planStorageUsage([{ path: `${A}/a.webp`, size: 0 }], [row(`${A}/a.webp`, 10, 100000)], NOW, 60);
    expect(plan.remove).toEqual([]);
  });

  it("keeps an unlisted row inside the grace period and removes one just past it", () => {
    const plan = planStorageUsage([], [row(`${A}/fresh.webp`, 10, 59), row(`${A}/stale.webp`, 10, 61)], NOW, 60);
    expect(plan.remove).toEqual([`${A}/stale.webp`]);
  });

  it("keeps a row exactly at the grace boundary", () => {
    const plan = planStorageUsage([], [row(`${A}/edge.webp`, 10, 60)], NOW, 60);
    expect(plan.remove).toEqual([]);
  });

  it("totals the listing per account across owned, non-empty objects only", () => {
    const plan = planStorageUsage(
      [
        { path: `${A}/a.webp`, size: 10 },
        { path: `${A}/b.webp`, size: 5 },
        { path: `${B}/c.webp`, size: 7 },
        { path: `${A}/empty.webp`, size: 0 },
        { path: "srd/x.webp", size: 99 },
      ],
      [],
      NOW,
      60,
    );
    expect(plan.bytesByUser.get(A)).toBe(15);
    expect(plan.bytesByUser.get(B)).toBe(7);
  });
});

describe("groupByUser", () => {
  it("makes one group per account", () => {
    const groups = groupByUser([
      { path: `${A}/1`, userId: A, size: 1 },
      { path: `${B}/1`, userId: B, size: 1 },
      { path: `${A}/2`, userId: A, size: 1 },
    ]);
    expect(groups.get(A)?.map((e) => e.path)).toEqual([`${A}/1`, `${A}/2`]);
    expect(groups.get(B)).toHaveLength(1);
  });
});

describe("countOver", () => {
  it("counts only accounts strictly above the ceiling", () => {
    const totals = new Map([
      ["a", 100],
      ["b", 101],
      ["c", 500],
    ]);
    expect(countOver(totals, 100)).toBe(2);
  });
});
