import { describe, expect, it, vi, beforeEach } from "vitest";
import { useLevelUp } from "./useLevelUp";
import type { PartyMember } from "@/types/party.types";

const state = vi.hoisted(() => ({
  xp: false,
  campaign: { id: "c1", party_level: 5 as number | null },
  isDM: false,
  userId: "player-1",
}));

vi.mock("@/composables/rules/useOptionalRules", async () => {
  const { computed } = await import("vue");
  return { useIsRuleEnabled: () => computed(() => state.xp) };
});
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaign: state.campaign }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ isDM: state.isDM, user: { id: state.userId } }) }));

const member = (over: Partial<PartyMember> = {}) =>
  ({ id: "m1", campaign_id: "c1", level: 4, experience_points: 0, owner_user_id: "player-1", is_dm_managed: false, ...over }) as PartyMember;

describe("useLevelUp", () => {
  beforeEach(() => {
    state.xp = false;
    state.campaign = { id: "c1", party_level: 5 };
    state.isDM = false;
  });

  it("offers the player Level Up when the party level passes their character", () => {
    const { ready, action } = useLevelUp(member());
    expect(ready.value).toBe(true);
    expect(action.value).toBe("player");
  });

  // A character shown while another campaign is active (the pool, a detached sheet) must not read that campaign's
  // party level as its own.
  it("ignores the active campaign's party level for a character of another campaign", () => {
    expect(useLevelUp(member({ campaign_id: "c2" })).ready.value).toBe(false);
  });

  it("does not judge a character of another campaign by the active campaign's XP rule", () => {
    state.xp = true;
    expect(useLevelUp(member({ campaign_id: "c2", experience_points: 6500 })).ready.value).toBe(false);
  });

  it("reads XP, not the party level, in an Experience campaign", () => {
    state.xp = true;
    expect(useLevelUp(member({ experience_points: 0 })).ready.value).toBe(false);
    // PHB 2014 advancement: 6,500 XP is 5th level.
    expect(useLevelUp(member({ experience_points: 6500 })).ready.value).toBe(true);
  });

  it("does not offer the DM a player's character", () => {
    state.isDM = true;
    state.userId = "dm-1";
    expect(useLevelUp(member()).action.value).toBeNull();
  });
});
