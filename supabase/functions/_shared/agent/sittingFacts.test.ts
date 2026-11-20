import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake } from "@/test/supabaseFake";
import { loadSittingFacts } from "./sittingFacts";

describe("loadSittingFacts", () => {
  // Bug caught: a struck fact (it never happened) reaching the recap and the NPCs' memories.
  it("leaves out a fact the DM struck", async () => {
    const fake = createSupabaseFake();
    fake.seed("story_facts", [
      { id: "f1", agent_session_id: "s1", body: "Kept.", known_to_player: true, struck_at: null, created_at: "2026-11-10T10:00:00Z" },
      { id: "f2", agent_session_id: "s1", body: "Struck.", known_to_player: true, struck_at: "2026-11-11T10:00:00Z", created_at: "2026-11-10T10:01:00Z" },
    ]);
    expect(await loadSittingFacts(fake.client as unknown as SupabaseClient, "s1")).toEqual([{ body: "Kept.", known_to_player: true }]);
  });
});
