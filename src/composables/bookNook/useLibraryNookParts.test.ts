import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { fetchLibraryNookParts } from "./useLibraryNookParts";

beforeEach(() => fake.reset());

describe("fetchLibraryNookParts", () => {
  it("shelves by group, then by position within the group", async () => {
    fake.seed("library_nook_parts", [
      { id: "c2", group_key: "fire", sort_order: 2 },
      { id: "f1", group_key: "frames", sort_order: 1 },
      { id: "c1", group_key: "fire", sort_order: 1 },
      { id: "a1", group_key: "air", sort_order: 5 },
    ]);
    expect((await fetchLibraryNookParts()).map((p) => p.id)).toEqual(["a1", "c1", "c2", "f1"]);
  });

  it("throws the error instead of showing an empty shelf", async () => {
    fake.failNext("library_nook_parts", { message: "boom" });
    await expect(fetchLibraryNookParts()).rejects.toMatchObject({ message: "boom" });
  });
});
