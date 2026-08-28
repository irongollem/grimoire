<template>
  <div class="flex flex-col gap-2">
    <span class="text-label-lg text-muted-foreground uppercase">Scope</span>
    <SegmentedControl
      v-model="scopeValue"
      size="md"
      block
      :options="scopeOptions"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * DM-authoring visibility scope, extracted from ItemDetail's original Scope
 * block (#597) so items/monsters/traps/puzzles share one control instead of
 * four copies. `null` campaign_id means "available in every campaign"; a set
 * value means "only visible when that campaign is active" — see
 * `allowedCampaignScoped` in campaignContentGating.ts for how callers read it.
 */
import { computed } from "vue";
import { storeToRefs } from "pinia";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import { useCampaignStore } from "@/stores/campaign";
import { useCampaigns } from "@/composables/campaign/useCampaigns";

const campaignId = defineModel<string | null>({ required: true });

const campaignStore = useCampaignStore();
const { activeCampaign, activeCampaignId } = storeToRefs(campaignStore);
const { data: allCampaigns } = useCampaigns();

const scopeCampaignName = computed(() => {
  if (!campaignId.value) return null;
  if (campaignId.value === activeCampaignId.value) return activeCampaign.value?.name ?? null;
  return allCampaigns.value?.find((c) => c.id === campaignId.value)?.name ?? null;
});

// SegmentedControl needs string|number values — "" stands in for the null
// (general/all-campaigns) scope so the two-state toggle can drive campaignId.
const scopeValue = computed<string>({
  get: () => (campaignId.value === null ? "" : "campaign"),
  set: (v) => {
    campaignId.value = v === "" ? null : (campaignId.value ?? activeCampaignId.value);
  },
});
const scopeOptions = computed(() => [
  { value: "", label: "General — all campaigns" },
  {
    value: "campaign",
    label: `Campaign${scopeCampaignName.value ? ` — ${scopeCampaignName.value}` : ""}`,
    disabled: !activeCampaignId.value && !campaignId.value,
  },
]);
</script>
