<template>
  <div
    v-if="total > 0 && !dismissed"
    class="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 flex items-center gap-3 text-sm text-amber-700 dark:text-amber-300"
    role="status"
  >
    <!--
      "records", not "items": `total` sums every kind, and `item` is a specific
      entity in this app. On the campaign this was first checked against, 209
      unindexed records included exactly 6 items and 185 locations — a DM
      reading "209 items" would have gone looking in the vault for 203 that
      were never there. The card names the kinds; a banner has room for a
      number and a link, so it uses a noun that cannot be mistaken for one of
      them. And it does not claim a transfer caused this — that is the usual
      cause, not the only one, and the card explains it properly.
    -->
    <span class="flex-1">
      {{ total }} {{ total === 1 ? "record" : "records" }} in this campaign
      {{ total === 1 ? "isn't" : "aren't" }} indexed for AI search yet, so generators won't offer
      {{ total === 1 ? "it" : "them" }}.
      <RouterLink
        class="ml-1 underline font-semibold"
        :to="{ name: 'campaign-settings', query: { tab: 'ai' } }"
      >Review in AI settings</RouterLink>
    </span>
    <AppButton
      variant="ghost"
      size="icon-xs"
      icon-size="sm"
      :icon="IconClose"
      tooltip="Dismiss"
      aria-label="Dismiss"
      class="shrink-0 text-amber-700 dark:text-amber-300"
      @click="dismiss"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The announcement half of the transfer-ownership embedding offer (#841) —
 * the campaign's AI settings tab (EmbedMissingContentCard) is the permanent
 * home, this is what makes a DM who never opens settings notice the offer
 * exists at all. Shown on the campaign dashboard, since that is where every
 * DM lands after a transfer.
 *
 * Dismissing hides only this banner, per campaign (`useUiStore`,
 * `useLocalStorage`) — the card stays up regardless, and a DM who says no
 * here is not broken out of anything: unindexed content is degraded, not
 * broken, and retrieval falls back to the compact candidate list.
 *
 * Reads the same `useUnembeddedContent()` composable as
 * EmbedMissingContentCard.vue, never a second count query, so the two
 * surfaces can never disagree about how much is missing.
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import { IconClose } from "@/lib/icons";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import { useUnembeddedContent } from "@/composables/ai/useUnembeddedContent";

const campaign = useCampaignStore();
const ui = useUiStore();
const { total } = useUnembeddedContent();

const dismissed = computed(() => {
  const id = campaign.activeCampaignId;
  return id === null || ui.isEmbedOfferBannerDismissed(id);
});

function dismiss() {
  const id = campaign.activeCampaignId;
  if (id !== null) ui.dismissEmbedOfferBanner(id);
}
</script>
