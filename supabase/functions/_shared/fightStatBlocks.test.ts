import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createSupabaseFake } from "../../../src/test/supabaseFake";
import { loadMonsters, loadStatBlocks } from "./fightStatBlocks.ts";

const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const OTHER_CAMPAIGN = "00000000-0000-4000-8000-0000000000c2";
const OWNER = "00000000-0000-4000-8000-0000000000a1";
const CO_DM = "00000000-0000-4000-8000-0000000000a2";
const PLAYER = "00000000-0000-4000-8000-0000000000a3";
const STRANGER = "00000000-0000-4000-8000-0000000000a4";

const MINE = "11111111-1111-4111-8111-111111111111"; // made in this campaign, by a player-less author
const OWNERS_ELSEWHERE = "11111111-1111-4111-8111-111111111112"; // the owner's own monster from another campaign
const CO_DMS = "11111111-1111-4111-8111-111111111113"; // a co-DM's monster from another campaign
const PLAYERS = "11111111-1111-4111-8111-111111111114"; // a player's monster in another campaign
const STRANGERS = "11111111-1111-4111-8111-111111111115"; // an unrelated account's private monster

function world() {
  const fake = createSupabaseFake();
  fake.seed("campaigns", [{ id: CAMPAIGN, user_id: OWNER }]);
  fake.seed("campaign_members", [
    { campaign_id: CAMPAIGN, user_id: CO_DM, role: "dm" },
    { campaign_id: CAMPAIGN, user_id: PLAYER, role: "player" },
  ]);
  fake.seed("monsters", [
    { id: MINE, user_id: STRANGER, campaign_id: CAMPAIGN, name: "Mine" },
    { id: OWNERS_ELSEWHERE, user_id: OWNER, campaign_id: OTHER_CAMPAIGN, name: "Owner's" },
    { id: CO_DMS, user_id: CO_DM, campaign_id: OTHER_CAMPAIGN, name: "Co-DM's" },
    { id: PLAYERS, user_id: PLAYER, campaign_id: OTHER_CAMPAIGN, name: "Player's" },
    { id: STRANGERS, user_id: STRANGER, campaign_id: OTHER_CAMPAIGN, name: "Stranger's" },
  ]);
  return fake.client as unknown as SupabaseClient;
}

const ids = [MINE, OWNERS_ELSEWHERE, CO_DMS, PLAYERS, STRANGERS];

describe("loadMonsters", () => {
  // App convention: a custom monster is usable by this campaign's DMs when it belongs to the campaign or was authored by the
  // owner or a dm member. The player's and the stranger's monsters of other campaigns are private to them.
  it("fails if a custom monster of an account that is not this campaign's DM, in another campaign, is read by its id", async () => {
    const found = await loadMonsters(world(), CAMPAIGN, ids);
    expect(found.map((m) => m.id).sort()).toEqual([MINE, OWNERS_ELSEWHERE, CO_DMS].sort());
  });

  it("fails if loadStatBlocks reads monsters without the campaign's scope", async () => {
    const sources = await loadStatBlocks(world(), CAMPAIGN, { monsterIds: [STRANGERS, CO_DMS], npcIds: [], companionIds: [] });
    expect(sources.monsters.map((m) => m.id)).toEqual([CO_DMS]);
  });
});
