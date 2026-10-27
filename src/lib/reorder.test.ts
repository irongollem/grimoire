import { beforeEach, describe, it, expect, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { persistReorder, toReorderEntries } from "@/lib/reorder";

beforeEach(() => fake.reset());

describe("toReorderEntries", () => {
  it("assigns 0-based sort_order by position, preserving input order", () => {
    expect(toReorderEntries(["c", "a", "b"])).toEqual([
      { id: "c", sort_order: 0 },
      { id: "a", sort_order: 1 },
      { id: "b", sort_order: 2 },
    ]);
  });
});

describe("persistReorder", () => {
  it("sends each id with the position it was dragged to", async () => {
    // Stands in for the reorder_* function, which pairs ids[i] with orders[i].
    const applied = new Map<string, number>();
    fake.onRpc("reorder_notes", (args) => {
      const ids = args.p_ids as string[];
      const orders = args.p_orders as number[];
      ids.forEach((id, i) => applied.set(id, orders[i]));
      return null;
    });

    await persistReorder("reorder_notes", toReorderEntries(["c", "a", "b"]));

    expect(Object.fromEntries(applied)).toEqual({ c: 0, a: 1, b: 2 });
  });

  it("sends nothing for an empty list", async () => {
    await persistReorder("reorder_notes", []);
    expect(fake.calls).toHaveLength(0);
  });

  it("throws the server's refusal so the caller can roll the list back", async () => {
    fake.onRpc("reorder_notes", () => null);
    fake.failNext("reorder_notes", { message: "not a member of this campaign" });
    await expect(persistReorder("reorder_notes", toReorderEntries(["a", "b"]))).rejects.toMatchObject({
      message: "not a member of this campaign",
    });
  });
});
