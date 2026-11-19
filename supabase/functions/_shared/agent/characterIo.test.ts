import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake, type SupabaseFake } from "@/test/supabaseFake";
import { loadPartyMember } from "./characterIo";

// Whether the Narrator is told the played character may level up (#1021 row 27) is read by the campaign's own way of
// levelling, as the sheet reads it. What would go wrong silently: a milestone campaign told by XP (or the reverse), or
// another campaign's party level counted.
describe("loadPartyMember: whether the character may level up", () => {
  let fake: SupabaseFake;
  const load = () => loadPartyMember(fake.client as unknown as SupabaseClient, "c1", "m1");

  /** Seeds once per test: the fake adds rows on every seed. Campaign c2 is another campaign at a higher level. */
  function setup(o: { partyLevel: number | null; xpRule?: boolean; xp?: number }) {
    fake = createSupabaseFake();
    fake.seed("party_members", [{ id: "m1", campaign_id: "c1", name: "Wren", level: 3, experience_points: o.xp ?? 0, max_hp: 20, current_hp: 20 }]);
    fake.seed("campaigns", [
      { id: "c1", party_level: o.partyLevel },
      { id: "c2", party_level: 9 },
    ]);
    fake.seed("campaign_rules", o.xpRule === undefined ? [] : [{ campaign_id: "c1", rule_key: "xp_levelling", enabled: o.xpRule }]);
  }

  it("with no rule row the campaign levels by milestone, and a party level above the character makes it ready", async () => {
    setup({ partyLevel: 4 });
    expect((await load())?.mayLevelUp).toBe("milestone");
  });

  it("another campaign's party level does not count", async () => {
    setup({ partyLevel: null });
    expect((await load())?.mayLevelUp).toBeNull();
  });

  it("an Experience campaign reads the character's XP and ignores the party level", async () => {
    setup({ partyLevel: 9, xpRule: true });
    expect((await load())?.mayLevelUp).toBeNull();
    // PHB 2014 advancement: 2,700 XP is 4th level.
    setup({ partyLevel: 9, xpRule: true, xp: 2700 });
    expect((await load())?.mayLevelUp).toBe("experience");
  });

  it("a failed read leaves the turn its character, only without the level-up line", async () => {
    setup({ partyLevel: 4 });
    fake.failNext("campaign_rules", { message: "down" });
    const loaded = await load();
    expect(loaded?.name).toBe("Wren");
    expect(loaded?.mayLevelUp).toBeNull();
  });
});
