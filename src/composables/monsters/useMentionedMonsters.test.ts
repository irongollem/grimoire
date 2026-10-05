import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { table: string; select: string; in: [string, unknown[]][] };
const mocks = vi.hoisted(() => ({
  calls: [] as Call[],
  rows: {} as Record<string, Record<string, unknown>[]>,
}));

vi.mock("@/lib/supabase", () => {
  const builder = (table: string) => {
    const call: Call = { table, select: "", in: [] };
    mocks.calls.push(call);
    const b: Promise<{ data: unknown[]; error: null }> & Record<string, unknown> = Object.assign(
      new Promise<{ data: unknown[]; error: null }>((resolve) => {
        queueMicrotask(() => {
          const ids = new Set(call.in.flatMap(([, v]) => v));
          resolve({ data: (mocks.rows[table] ?? []).filter((r) => ids.has(String(r.id ?? r.entry_id))), error: null });
        });
      }),
      {} as Record<string, unknown>,
    );
    b.select = (s: string) => ((call.select = s), b);
    b.eq = () => b;
    b.in = (c: string, v: unknown[]) => (call.in.push([c, v]), b);
    return b;
  };
  return { getCurrentUser: () => ({ id: "user-1" }), supabase: { from: builder } };
});

import { fetchMentionedMonsters } from "./useMentionedMonsters";

const UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

beforeEach(() => {
  mocks.calls.length = 0;
  mocks.rows = {
    library_monsters: [{ id: "srd_wolf", name: "Wolf", description: "lore", image_url: "row.webp" }],
    monsters: [{ id: UUID, name: "Gnarl", description: null, image_url: "own.webp" }],
    library_monster_art_canonical: [{ entry_id: "srd_wolf", image_url: "art.webp", cutout_url: null, portrait_focal_point: null }],
    library_monster_art: [],
  };
});

describe("fetchMentionedMonsters", () => {
  it("reads only the named rows, with the library lore and the art tables' picture over the row's own", async () => {
    const out = await fetchMentionedMonsters(["srd_wolf", UUID]);
    expect(out.get("srd_wolf")).toEqual({ name: "Wolf", description: "lore", image_url: "art.webp" });
    expect(out.get(UUID)).toEqual({ name: "Gnarl", description: null, image_url: "own.webp" });
    expect(mocks.calls.find((c) => c.table === "library_monsters")?.in).toEqual([["id", ["srd_wolf"]]]);
    expect(mocks.calls.find((c) => c.table === "monsters")?.in).toEqual([["id", [UUID]]]);
    expect(mocks.calls.every((c) => !c.select.includes("*"))).toBe(true);
  });

  it("sends nothing for no ids", async () => {
    expect((await fetchMentionedMonsters([])).size).toBe(0);
    expect(mocks.calls).toEqual([]);
  });
});
