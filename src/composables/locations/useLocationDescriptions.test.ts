import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { fetchLocationDescriptions } from "./useLocationDescriptions";

/** How many ids one `in` filter carried. */
const idCount = (value: unknown): number => (Array.isArray(value) ? value.length : -1);

describe("fetchLocationDescriptions", () => {
  beforeEach(() => {
    fake.reset();
    fake.seed("locations", [
      { id: "a", description: "Crypt" },
      { id: "b", description: null },
      { id: "not-asked", description: "Elsewhere" },
    ]);
  });

  it("returns only the requested places, an unwritten one as null", async () => {
    const map = await fetchLocationDescriptions(["a", "b"]);
    expect([...map.entries()]).toEqual([["a", "Crypt"], ["b", null]]);
  });

  it("reads a large request in chunks of at most 100 ids and loses none", async () => {
    const ids = Array.from({ length: 230 }, (_, i) => `id-${i}`);
    fake.seed("locations", ids.map((id) => ({ id, description: `d-${id}` })));
    const map = await fetchLocationDescriptions(ids);
    expect(map.size).toBe(230);
    // The request is the property: one `in` with every id would be refused as a URL.
    const sizes = fake.calls.map((c) => idCount(c.filters[0]?.value));
    expect(sizes.sort((x, y) => x - y)).toEqual([30, 100, 100]);
  });

  it("throws the database error instead of reporting an empty map", async () => {
    fake.failNext("locations", { message: "boom" });
    await expect(fetchLocationDescriptions(["a"])).rejects.toMatchObject({ message: "boom" });
  });
});
