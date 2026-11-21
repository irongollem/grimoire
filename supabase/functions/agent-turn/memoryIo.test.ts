import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake } from "@/test/supabaseFake";
import { loadSceneMemories } from "./memoryIo";

const C = "c1";
const OTHER_C = "c2";

function world() {
  const fake = createSupabaseFake();
  fake.seed("npcs", [
    { id: "maren", campaign_id: C, name: "Maren", disguise_name: null, is_revealed: false },
    { id: "vane", campaign_id: C, name: "Lord Vane", disguise_name: "Old Tom", is_revealed: false },
    { id: "absent", campaign_id: C, name: "Absent", disguise_name: null, is_revealed: false },
  ]);
  return fake;
}

const memory = (npc_id: string, body: string, created_at: string, campaign_id = C) => ({ npc_id, campaign_id, body, created_at });
const run = (fake: ReturnType<typeof createSupabaseFake>, ids: string[], campaign = C) =>
  loadSceneMemories(fake.client as unknown as SupabaseClient, campaign, ids);

describe("loadSceneMemories", () => {
  it("reads the memories of the characters who are here, under the names they are shown by", async () => {
    const fake = world();
    fake.seed("npc_memories", [memory("maren", "Paid the toll.", "2026-11-01T10:00:00Z"), memory("absent", "Not here.", "2026-11-02T10:00:00Z")]);
    expect(await run(fake, ["maren"])).toEqual([{ npcId: "maren", name: "Maren", body: "Paid the toll.", createdAt: "2026-11-01T10:00:00Z" }]);
  });

  // Bug caught: a memory written by the DM named the character by the true name, which the disguise rule withholds.
  it("masks the true name of a disguised character in the memory and shows the disguise", async () => {
    const fake = world();
    fake.seed("npc_memories", [memory("vane", "Lord Vane admitted the debt.", "2026-11-01T10:00:00Z")]);
    const [m] = await run(fake, ["vane"]);
    expect(m.name).toBe("Old Tom");
    expect(m.body).toBe("Old Tom admitted the debt.");
  });

  // Bug caught: the read had no campaign filter, so an id from another campaign's memories came back.
  it("never returns another campaign's memory", async () => {
    const fake = world();
    fake.seed("npc_memories", [memory("maren", "Foreign.", "2026-11-01T10:00:00Z", OTHER_C)]);
    expect(await run(fake, ["maren"])).toEqual([]);
  });

  it("asks nothing when nobody is here", async () => {
    const fake = world();
    expect(await run(fake, [])).toEqual([]);
    expect(fake.calls).toEqual([]);
  });

  it("fails the read on a database error, so the turn runs without the section", async () => {
    const fake = world();
    fake.failNext("npc_memories", { message: "db down" });
    await expect(run(fake, ["maren"])).rejects.toThrow("db down");
  });
});
