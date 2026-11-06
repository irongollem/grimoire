import { toRef, type Ref } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { systemOffers, type GameFeature, type GameSystemKey } from "@/systems/registry";

/**
 * The active campaign's game system, reactively (#934). `offers(feature)` is the
 * one test a surface uses to decide whether it shows: the DM nav, the player
 * tabs, the dashboard catalogue and Settings all ask it (the route fence asks
 * `systemOffers` itself, outside any component).
 */
export function useGameSystem(): {
  system: Readonly<Ref<GameSystemKey>>;
  offers: (feature: GameFeature) => boolean;
} {
  const campaign = useCampaignStore();
  return {
    system: toRef(campaign, "activeGameSystem"),
    offers: (feature) => systemOffers(campaign.activeGameSystem, feature),
  };
}
