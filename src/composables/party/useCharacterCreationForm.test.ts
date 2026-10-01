import { describe, expect, it } from "vitest";
import {
  partitionBundleEntries,
  buildBackgroundEquipmentRows,
  resolveCharacterPlacement,
} from "./useCharacterCreationForm";
import type { VaultEntry } from "./useCharacterEquipmentSeeding";

const CARRIER = "member-1";

describe("partitionBundleEntries", () => {
  it("routes plain items to a batched row and resolves their vault item_id", () => {
    const vaultMap = new Map<string, VaultEntry>([
      ["greataxe", { id: "11111111-1111-4111-8111-111111111111", bundle_items: null }],
      ["javelin", { id: "22222222-2222-4222-8222-222222222222", bundle_items: null }],
    ]);
    const { plainRows, packEntries } = partitionBundleEntries(
      [{ name: "Greataxe" }, { name: "Javelin", quantity: 4 }],
      vaultMap,
      CARRIER,
    );

    expect(packEntries).toEqual([]);
    expect(plainRows).toEqual([
      {
        item_id: "11111111-1111-4111-8111-111111111111", library_item_id: null, name: "Greataxe", quantity: 1,
        carried_by: CARRIER, location: "backpack",
        slot: null, is_container: false, container_id: null,
        is_attuned: false, is_equipped: false, notes: null,
        current_charges: null, is_identified: true, is_ruined: false, sort_order: 0,
      },
      {
        item_id: "22222222-2222-4222-8222-222222222222", library_item_id: null, name: "Javelin", quantity: 4,
        carried_by: CARRIER, location: "backpack",
        slot: null, is_container: false, container_id: null,
        is_attuned: false, is_equipped: false, notes: null,
        current_charges: null, is_identified: true, is_ruined: false, sort_order: 0,
      },
    ]);
  });

  it("routes entries with bundle_items to packEntries instead of batching them", () => {
    const vaultMap = new Map<string, VaultEntry>([
      ["explorer's pack", { id: "55555555-5555-4555-8555-555555555555", bundle_items: [{ name: "Bedroll", quantity: 1 }] }],
      ["rapier", { id: "44444444-4444-4444-8444-444444444444", bundle_items: null }],
    ]);
    const { plainRows, packEntries } = partitionBundleEntries(
      [{ name: "Rapier" }, { name: "Explorer's Pack" }],
      vaultMap,
      CARRIER,
    );

    expect(packEntries).toEqual([{ name: "Explorer's Pack" }]);
    expect(plainRows).toHaveLength(1);
    expect(plainRows[0].name).toBe("Rapier");
  });

  it("falls back to item_id: null for a name with no vault match, still batched", () => {
    const { plainRows, packEntries } = partitionBundleEntries(
      [{ name: "Homebrew Whatsit" }],
      new Map(),
      CARRIER,
    );
    expect(packEntries).toEqual([]);
    expect(plainRows[0]).toMatchObject({ item_id: null, name: "Homebrew Whatsit", quantity: 1 });
  });

  it("treats an entry whose vault match has an empty bundle_items array as plain", () => {
    const vaultMap = new Map<string, VaultEntry>([
      ["dagger", { id: "33333333-3333-4333-8333-333333333333", bundle_items: [] }],
    ]);
    const { plainRows, packEntries } = partitionBundleEntries([{ name: "Dagger" }], vaultMap, CARRIER);
    expect(packEntries).toEqual([]);
    expect(plainRows[0].item_id).toBe("33333333-3333-4333-8333-333333333333");
  });
});

describe("buildBackgroundEquipmentRows", () => {
  it("splits the background's free-text equipment into one plain row each", () => {
    const rows = buildBackgroundEquipmentRows(
      "a holy symbol, a prayer book, vestments, a set of common clothes, and a belt pouch containing 15 gp",
      CARRIER,
    );
    expect(rows.map((r) => r.name)).toEqual([
      "a holy symbol",
      "a prayer book",
      "vestments",
      "a set of common clothes",
      "a belt pouch containing 15 gp",
    ]);
    for (const row of rows) {
      expect(row.item_id).toBeNull();
      expect(row.quantity).toBe(1);
      expect(row.carried_by).toBe(CARRIER);
      expect(row.location).toBe("backpack");
      expect(row.is_container).toBe(false);
    }
  });

  it("returns no rows for empty equipment text", () => {
    expect(buildBackgroundEquipmentRows("", CARRIER)).toEqual([]);
    expect(buildBackgroundEquipmentRows("   ", CARRIER)).toEqual([]);
  });
});

describe("resolveCharacterPlacement", () => {
  const CREATOR = "user-1";
  const CAMPAIGN = "campaign-1";

  it("leaves a DM's roster character unclaimed in the active campaign", () => {
    expect(resolveCharacterPlacement({
      isDmCreate: true, activeCampaignId: CAMPAIGN, creatorId: CREATOR,
    })).toEqual({ campaign_id: CAMPAIGN, owner_user_id: null });
  });

  it("gives a player's own character to them, with no campaign of its own", () => {
    // The player's character is linked to a campaign through campaign_members,
    // not by stamping campaign_id at creation.
    expect(resolveCharacterPlacement({
      isDmCreate: false, activeCampaignId: CAMPAIGN, creatorId: CREATOR,
    })).toEqual({ campaign_id: null, owner_user_id: CREATOR });
  });

  it("gives a DM create with no active campaign to its creator", () => {
    // Regression for #738. Deriving both fields from isDmCreate alone set
    // campaign_id AND owner_user_id to null here, producing a character that
    // useParty, useMyCharacters, useOfferedCharacters and useCharacterPool all
    // filter out — created, levellable by direct link, and visible nowhere.
    const placement = resolveCharacterPlacement({
      isDmCreate: true, activeCampaignId: null, creatorId: CREATOR,
    });

    expect(placement).toEqual({ campaign_id: null, owner_user_id: CREATOR });
    expect(placement.owner_user_id).not.toBeNull();
  });

  it("never returns a row that is both unowned and unattached", () => {
    for (const isDmCreate of [true, false]) {
      for (const activeCampaignId of [CAMPAIGN, null]) {
        const { campaign_id, owner_user_id } = resolveCharacterPlacement({
          isDmCreate, activeCampaignId, creatorId: CREATOR,
        });
        expect(campaign_id === null && owner_user_id === null).toBe(false);
      }
    }
  });
});
