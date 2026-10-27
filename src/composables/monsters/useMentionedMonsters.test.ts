import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "user-1" }) }));

import { fetchMentionedMonsters } from "./useMentionedMonsters";

const UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

beforeEach(() => {
  fake.reset();
  fake.seed("library_monsters", [
    { id: "srd_wolf", name: "Wolf", description: "lore", image_url: "row.webp" },
    { id: "srd_bear", name: "Bear", description: "other", image_url: "bear.webp" },
  ]);
  fake.seed("monsters", [
    { id: UUID, name: "Gnarl", description: null, image_url: "own.webp" },
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Other", description: null, image_url: null },
  ]);
  fake.seed("library_monster_art_canonical", [{ entry_id: "srd_wolf", image_url: "art.webp", cutout_url: null, portrait_focal_point: null }]);
});

describe("fetchMentionedMonsters", () => {
  it("returns only the named rows, with the library lore and the art tables' picture over the row's own", async () => {
    const out = await fetchMentionedMonsters(["srd_wolf", UUID]);
    expect([...out.keys()].sort()).toEqual([UUID, "srd_wolf"]);
    expect(out.get("srd_wolf")).toEqual({ name: "Wolf", description: "lore", image_url: "art.webp" });
    expect(out.get(UUID)).toEqual({ name: "Gnarl", description: null, image_url: "own.webp" });
  });

  it("reads more than one request's worth of ids, past the 100-id chunk", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `srd_m${i}`);
    fake.seed("library_monsters", ids.map((id) => ({ id, name: id, description: null, image_url: null })));
    const out = await fetchMentionedMonsters(ids);
    expect(out.size).toBe(101);
  });

  it("sends nothing for no ids", async () => {
    expect((await fetchMentionedMonsters([])).size).toBe(0);
    expect(fake.calls).toEqual([]);
  });
});
