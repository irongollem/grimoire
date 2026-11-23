import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake } from "@/test/supabaseFake";
import { startFight } from "./fightIo";

// A fight that followed the party is the encounter's fight row opened again (#1021). Its XP is given once per fight,
// keyed on `encounter_state.xp_awarded_at` (#1021 row 27); a carried fight that kept the first fight's mark would give
// nothing for the foes the party brings down the second time.
describe("startFight: a fight that followed the party", () => {
  it("opens the row as a new fight, with the award mark and an old owed sheet cost cleared", async () => {
    const fake = createSupabaseFake();
    fake.seed("encounters", [{ id: "e1", campaign_id: "c1", party_member_ids: ["pm1"], combatants: [], location_id: "here" }]);
    fake.seed("encounter_state", [{
      id: "row1", encounter_id: "e1", campaign_id: "c1", version: 4,
      combatants_live: [{ instance_id: "w1", type: "monster", name: "Wolf", hp: 5, faction_id: "enemy" }],
      ended_at: "2026-11-19T10:00:00Z", xp_awarded_at: "2026-11-19T10:00:01Z",
      // A cost the last fight still owed: settled on the new fight it would undo whatever rest came between.
      owed_writes: { batchId: "b-old", slots: [{ memberId: "pm1", slots: [] }], innate: [], resources: [] },
    }]);
    fake.seed("agent_sessions", [{ id: "s1", campaign_id: "c1" }]);
    const client = fake.client as unknown as SupabaseClient;
    await startFight(
      client,
      client,
      { campaignId: "c1", sessionId: "s1", userId: "u1", memberId: "pm1", allies: [], locationId: "there", playSessionId: null },
      { kind: "prepared", encounterId: "e1", name: "The wolves", carried: ["Wolf"] },
    );
    const { data } = await client.from("encounter_state").select("*").eq("id", "row1").single();
    expect(data).toMatchObject({ ended_at: null, xp_awarded_at: null, owed_writes: null, version: 5 });
  });
});

// The sitting's AI-played companions fight beside the played character. Bug caught: allies left out of the
// encounter's party, or the played character pushed out of first place or listed twice.
describe("startFight: the companions who join", () => {
  const ctx = { campaignId: "c1", sessionId: "s1", userId: "u1", memberId: "pm1", allies: ["pm2", "pm1", "pm3"], locationId: "here", playSessionId: null };

  it("lists the played member first and each ally once in an improvised fight", async () => {
    const fake = createSupabaseFake();
    fake.seed("monsters", [{ id: "m1", campaign_id: "c1", name: "Wolf" }]);
    fake.seed("agent_sessions", [{ id: "s1", campaign_id: "c1" }]);
    const client = fake.client as unknown as SupabaseClient;
    await startFight(client, client, ctx, { kind: "improvised", name: "Wolves", creatures: [{ monsterId: "m1", npcId: null, count: 2 }] });
    const { data } = await client.from("encounters").select("party_member_ids").eq("campaign_id", "c1").single();
    expect(data?.party_member_ids).toEqual(["pm1", "pm2", "pm3"]);
  });

  it("adds the missing allies to a prepared fight without losing its own party", async () => {
    const fake = createSupabaseFake();
    fake.seed("encounters", [{ id: "e1", campaign_id: "c1", party_member_ids: ["pm9", "pm2"], combatants: [], location_id: "here" }]);
    fake.seed("agent_sessions", [{ id: "s1", campaign_id: "c1" }]);
    const client = fake.client as unknown as SupabaseClient;
    await startFight(client, client, ctx, { kind: "prepared", encounterId: "e1", name: "The wolves" });
    const { data } = await client.from("encounters").select("party_member_ids").eq("id", "e1").single();
    expect(data?.party_member_ids).toEqual(["pm9", "pm2", "pm1", "pm3"]);
  });
});
