/**
 * Ask Grimoire (#1270): the inputs a campaign cannot use are not shown.
 *
 * A contract input names a check by key (`available: "group_portrait"`); this file is where that name meets the
 * composable that knows. Each entry is called once per card from its setup and returns whether the campaign can use
 * the input now. While it cannot, the form hides the input and clears its value, so a request typed to the model
 * cannot carry one the DM could never have set. Mirrors `ASK_ASIDES` in `askAsides.ts`.
 */
import { computed, type ComputedRef } from "vue";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { useCampaignStore } from "@/stores/campaign";

export type AskAvailable = () => ComputedRef<boolean>;

export const ASK_AVAILABLE: Readonly<Record<string, AskAvailable>> = {
  /** The party in the picture: the campaign has a group portrait to send and an image provider to paint with (the old panel's own condition). */
  group_portrait: () => {
    const campaign = useCampaignStore();
    const { imageProvider } = useCampaignProviders();
    return computed(() => Boolean(imageProvider.value) && Boolean(campaign.activeCampaign?.group_portrait_url));
  },
};
