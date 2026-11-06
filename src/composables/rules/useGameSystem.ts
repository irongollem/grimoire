import { computed, type ComputedRef } from "vue";
import { storeToRefs } from "pinia";
import { useCampaignStore } from "@/stores/campaign";
import { systemOffers, type GameFeature, type GameSystemKey } from "@/systems/registry";

/**
 * The active campaign's game system, reactively (#934). `offers(feature)` is the
 * one test a surface uses to decide whether it shows: the DM nav, the player
 * tabs, the dashboard catalogue and the route guard all ask it.
 */
export function useGameSystem(): {
  system: ComputedRef<GameSystemKey>;
  offers: (feature: GameFeature) => boolean;
} {
  const { activeGameSystem } = storeToRefs(useCampaignStore());
  const system = computed(() => activeGameSystem.value);
  return { system, offers: (feature) => systemOffers(system.value, feature) };
}
