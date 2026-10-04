import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { libraryMonsterToInsert } from "./useMonsters";
import { libraryMonsterRow } from "@/lib/library/libraryMonsterRow";

const DESCRIPTION = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "A shaggy black bear." }] }],
});

const library = libraryMonsterRow({
  id: "srd_bear_black_bf",
  name: "Bear, Black",
  monster_type: "beast",
  size: "medium",
  alignment: "unaligned",
  habitat: null,
  source: "blackflag",
  tags: [],
  stat_block: { armor_class: 11, hit_points: "19", speed: "40 ft.", str: 15, dex: 10, con: 14, int: 2, wis: 12, cha: 7, challenge_rating: "1/2" },
  description: DESCRIPTION,
  notes: null,
  image_url: "https://cdn.example/bear.webp",
  portrait_focal_point: null,
  created_at: "",
  updated_at: "",
});

describe("libraryMonsterToInsert", () => {
  it("carries the library description into the DM's customized copy", () => {
    expect(libraryMonsterToInsert(library, "campaign-1").description).toBe(DESCRIPTION);
  });

  it("scopes the copy to the campaign it was customized in and marks its source", () => {
    const insert = libraryMonsterToInsert(library, "campaign-1");
    expect(insert.campaign_id).toBe("campaign-1");
    expect(insert.source).toBe("blackflag (customized)");
  });
});
