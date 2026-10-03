import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = new Map<string, Record<string, unknown>[]>();
const reads: { table: string; filters: Record<string, string> }[] = [];

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      const filters: Record<string, string> = {};
      // A real Promise carrying the builder methods, so `await` works without a
      // hand-written `then`.
      const builder = (): Promise<{ data: Record<string, unknown>[]; error: null }> & object =>
        Object.assign(Promise.resolve({ data: rows.get(table) ?? [], error: null as null }), {
          eq: (column: string, value: string) => {
            filters[column] = value;
            if (column === "user_id" && table !== "campaigns") reads.push({ table, filters });
            return builder();
          },
          maybeSingle: async () => ({ data: rows.get(table)?.[0] ?? null, error: null }),
        });
      return { select: () => builder() };
    },
  },
}));

import { campaignFileUrls, CASCADED_TABLES, DISPOSED_TABLES } from "./campaignFiles";
import { IMAGE_REFERENCES } from "@/lib/storage/deleteUnreferenced";

beforeEach(() => {
  rows.clear();
  reads.length = 0;
  rows.set("campaigns", [{ group_portrait_url: "https://cdn/group.webp", demo_source: null }]);
});

describe("campaignFileUrls (#918)", () => {
  it("collects the files the cascade orphans, and the campaign's own portrait", async () => {
    rows.set("locations", [{ image_url: "https://cdn/loc.webp", map_url: "https://cdn/map.webp", map_layer_url: null }]);
    rows.set("deities", [{ portrait_url: null, symbol_image_url: "https://cdn/sym.webp" }]);
    rows.set("monsters", [{ image_url: "https://cdn/m.webp", cutout_url: null }]);

    const urls = await campaignFileUrls("c1", "u1", "promote");

    expect(urls.sort()).toEqual(["https://cdn/group.webp", "https://cdn/loc.webp", "https://cdn/map.webp", "https://cdn/sym.webp"]);
  });

  it("adds the deleted homebrew's files only when the DM deletes it", async () => {
    rows.set("monsters", [{ image_url: "https://cdn/m.webp", cutout_url: "https://cdn/m-cut.webp" }]);
    const urls = await campaignFileUrls("c1", "u1", "delete");
    expect(urls).toContain("https://cdn/m.webp");
    expect(urls).toContain("https://cdn/m-cut.webp");
  });

  it("reads only the caller's rows in this campaign", async () => {
    await campaignFileUrls("c1", "u1", "delete");
    expect(reads.length).toBe(CASCADED_TABLES.length + DISPOSED_TABLES.length);
    expect(reads.every((r) => r.filters.campaign_id === "c1" && r.filters.user_id === "u1")).toBe(true);
  });

  it("leaves a demo campaign's files alone: they are the template author's", async () => {
    rows.set("campaigns", [{ group_portrait_url: "https://cdn/group.webp", demo_source: "sugarwell" }]);
    rows.set("locations", [{ image_url: "https://cdn/loc.webp", map_url: null, map_layer_url: null }]);
    expect(await campaignFileUrls("c1", "u1", "delete")).toEqual([]);
  });

  it("names only tables the reference check knows, so every collected file is checked", () => {
    const known = new Set<string>(IMAGE_REFERENCES.map(([table]) => table));
    for (const table of [...CASCADED_TABLES, ...DISPOSED_TABLES]) expect(known.has(table)).toBe(true);
  });
});
