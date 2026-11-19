import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake } from "@/test/supabaseFake";
import { startFight } from "./fightIo";

// A fight that followed the party is the encounter's fight row opened again (#1021). Its XP is given once per fight,
// keyed on `encounter_state.xp_awarded_at` (#1021 row 27); a carried fight that kept the first fight's mark would give
// nothing for the foes the party brings down the second time.
describe("startFight: a fight that followed the party", () => {
  it("opens the row as a new fight, with the award mark cleared", async () => {
    const fake = createSupabaseFake();
    fake.seed("encounters", [{ id: "e1", campaign_id: "c1", party_member_ids: ["pm1"], combatants: [], location_id: "here" }]);
    fake.seed("encounter_state", [{
      id: "row1", encounter_id: "e1", campaign_id: "c1", version: 4,
      combatants_live: [{ instance_id: "w1", type: "monster", name: "Wolf", hp: 5, faction_id: "enemy" }],
      ended_at: "2026-11-19T10:00:00Z", xp_awarded_at: "2026-11-19T10:00:01Z",
    }]);
    fake.seed("agent_sessions", [{ id: "s1", campaign_id: "c1" }]);
    const client = fake.client as unknown as SupabaseClient;
    await startFight(
      client,
      client,
      { campaignId: "c1", sessionId: "s1", userId: "u1", memberId: "pm1", locationId: "there", playSessionId: null },
      { kind: "prepared", encounterId: "e1", name: "The wolves", carried: ["Wolf"] },
    );
    const { data } = await client.from("encounter_state").select("*").eq("id", "row1").single();
    expect(data).toMatchObject({ ended_at: null, xp_awarded_at: null, version: 5 });
  });
});
