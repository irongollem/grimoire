/**
 * The record a portrait is painted for, read the way the Mint and Card Forge read it (#1253): the same context text
 * (`ai/entityImageContext`), plus whether the record already has a picture, which the quote must say before it is
 * replaced. Every read is scoped to the active campaign in the query; RLS is only the ceiling.
 *
 * Only the DM's own rows are paintable: a shared library entry is read-only (its id is a slug, not a uuid, and it is
 * in another table), so it never matches here.
 */
import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { PortraitKind } from "@/ai/useMissingPortrait";
import {
  itemImageContext, monsterImageContext, npcImageContext, partyMemberImageContext, spellImageContext,
} from "@/ai/entityImageContext";
import { ITEM_RARITY_LABELS, ITEM_TYPE_LABELS, type ItemRarity, type ItemType } from "@/types/item.types";
import { fetchResolvedSpecies } from "@/composables/rules/useSpecies";

export interface PortraitSubject {
  kind: PortraitKind;
  id: string;
  name: string;
  /** What the portrait author works from. Empty means there is nothing to paint from. */
  context: string;
  hasPicture: boolean;
}

export interface PortraitTarget {
  kind: PortraitKind;
  id: string;
}

/** One row of `table` for this campaign, or null when the campaign has no such row. */
async function readRow<T>(table: string, columns: string, campaignId: string, id: string): Promise<T | null> {
  const { data, error } = await supabase.from(table).select(columns).eq("id", id).eq("campaign_id", campaignId).maybeSingle();
  if (error) throw error;
  return data as T | null;
}

export async function fetchPortraitSubject(target: PortraitTarget, campaignId: string): Promise<PortraitSubject | null> {
  const { kind, id } = target;
  switch (kind) {
    case "npc": {
      const row = await readRow<{ name: string; race: string | null; occupation: string | null; appearance: string | null; personality: string | null; portrait_url: string | null }>(
        "npcs", "name, race, occupation, appearance, personality, portrait_url", campaignId, id);
      return row && { kind, id, name: row.name, context: npcImageContext(row), hasPicture: !!row.portrait_url };
    }
    case "party": {
      const row = await readRow<{ name: string; species_id: string | null; subrace: string | null; class: string | null; level: number; portrait_url: string | null }>(
        "party_members", "name, species_id, subrace, class, level, portrait_url", campaignId, id);
      if (!row) return null;
      const species = row.species_id ? await fetchResolvedSpecies(row.species_id) : null;
      const context = partyMemberImageContext({ name: row.name, speciesName: species?.name, subrace: row.subrace, className: row.class, level: row.level });
      return { kind, id, name: row.name, context, hasPicture: !!row.portrait_url };
    }
    case "monster": {
      const row = await readRow<{ name: string; size: string; monster_type: string; alignment: string; habitat: string | null; description: string | null; image_url: string | null }>(
        "monsters", "name, size, monster_type, alignment, habitat, description, image_url", campaignId, id);
      return row && { kind, id, name: row.name, context: monsterImageContext(row), hasPicture: !!row.image_url };
    }
    case "item": {
      const row = await readRow<{ name: string; description: string; item_type: ItemType; rarity: ItemRarity; image_url: string | null }>(
        "items", "name, description, item_type, rarity, image_url", campaignId, id);
      return row && {
        kind, id, name: row.name, hasPicture: !!row.image_url,
        context: itemImageContext(row, { type: ITEM_TYPE_LABELS[row.item_type], rarity: ITEM_RARITY_LABELS[row.rarity] }),
      };
    }
    case "spell": {
      const row = await readRow<{ name: string; level: number; school: string; description: string; image_url: string | null }>(
        "spells", "name, level, school, description, image_url", campaignId, id);
      return row && { kind, id, name: row.name, context: spellImageContext(row), hasPicture: !!row.image_url };
    }
  }
}

/** Reads the subject once there is a target; `undefined` data while it loads, null when the campaign has no such row. */
export function usePortraitSubject(target: MaybeRefOrGetter<PortraitTarget | null>) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => ["portrait-subject", campaignId.value, toValue(target)] as const),
    queryFn: ({ queryKey: [, id, wanted] }) => {
      if (!id || !wanted) throw new Error("No portrait target.");
      return fetchPortraitSubject(wanted, id);
    },
    enabled: () => campaignId.value !== null && toValue(target) !== null,
  });
}
