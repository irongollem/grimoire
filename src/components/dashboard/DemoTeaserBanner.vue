<template>
  <div
    v-if="url"
    class="rounded-lg border border-border bg-card px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
  >
    <p class="text-body text-muted-foreground">
      Sugarwell is one side-trip from <em>Late in the Kind Country</em> — a
      complete campaign of eleven chapters, written to be read two ways:
      bright for younger tables, deep for older ones.
    </p>
    <AppButton
      variant="link"
      size="inline-body"
      :href="url"
      target="_blank"
      rel="noopener"
      label="Get the full campaign"
      class="shrink-0 self-start sm:self-auto"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The dashboard half of the demo-campaign teaser (#912) — `DemoCampaignOffer`
 * gets a DM *into* Sugarwell; this is what tells them, once they are looking
 * at it, that it is a cut-down piece of a larger campaign that can be bought.
 *
 * Renders nothing unless both are true: the active campaign is a demo copy
 * (`demo_source` non-null) and there is somewhere to send anyone
 * (`VITE_FULL_CAMPAIGN_URL` set — see `demoTeaser.ts`). The env var is unset
 * everywhere today, including production, so this is currently invisible by
 * design rather than by accident: there is no storefront yet.
 *
 * A quiet strip in the dashboard's own card/border tokens, not a dismissible
 * banner — the DM did not do anything to earn a notice, and there is nothing
 * here to acknowledge or clear.
 */
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { useCampaignStore } from "@/stores/campaign";
import { fullCampaignUrl } from "./demoTeaser";

const campaign = useCampaignStore();

const url = computed(() => {
  if (campaign.activeCampaign?.demo_source == null) return null;
  return fullCampaignUrl();
});
</script>
