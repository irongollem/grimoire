import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {}, getCurrentUser: () => null }));

import { buildCatalogue } from "./useItems";
import type { Item } from "@/types/item.types";

function item(id: string, extra: Partial<Item> = {}): Item {
  return { id, name: id, ruleset: null, campaign_id: null, image_url: null, source: null, ...extra } as Item;
}

describe("buildCatalogue (#961)", () => {
  it("offers only the table's edition and campaign, but resolves every own row", () => {
    const custom = [
      item("same-edition", { ruleset: "2024" }),
      item("old-edition", { ruleset: "2014" }),
      item("other-campaign", { campaign_id: "c-other" }),
    ];
    const { browse, resolvable } = buildCatalogue(custom, [], undefined, "2024", "c-active", false);
    expect(browse.map((i) => i.id)).toEqual(["same-edition"]);
    expect(resolvable.map((i) => i.id).sort()).toEqual(["old-edition", "other-campaign", "same-edition"]);
  });

  it("keeps the library rows the narrowed fetch returned in both lists", () => {
    const { browse, resolvable } = buildCatalogue([], [item("srd_rope")], undefined, "2014", null, false);
    expect(browse.map((i) => i.id)).toEqual(["srd_rope"]);
    expect(resolvable).toBe(browse);
  });
});
