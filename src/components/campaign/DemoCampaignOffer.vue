<template>
  <div v-if="shouldOffer" :class="layout === 'full' ? 'mt-8 border-t border-border pt-6 text-center' : undefined">
    <p v-if="layout === 'full'" class="text-body text-muted-foreground italic mb-3">
      New to Grimoire? Explore a ready-made demo campaign — a side-trip from
      <em class="not-italic">Late in the Kind Country</em>, already set up with NPCs, a quest, a mapped site and
      music. It doesn't count toward your plan.
    </p>
    <AppButton
      v-if="layout === 'menu'"
      variant="menu"
      size="sm"
      block
      :disabled="isDisabled"
      @click="explore"
    >
      <IconNavCampaign class="h-3.5 w-3.5 text-muted-foreground" />
      <span class="font-cinzel text-xs text-muted-foreground">{{ label }}</span>
    </AppButton>
    <AppButton
      v-else
      :variant="layout === 'full' ? 'outline' : 'link'"
      :size="layout === 'full' ? 'md' : 'inline-body'"
      :disabled="isDisabled"
      :label="label"
      @click="explore"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The demo-campaign offer (#912), shown in the two places a new DM can reach
 * for it: below the DM/Player choice in WelcomeView (`layout="full"`, with the
 * explanatory paragraph) and as a quiet secondary action in NewCampaignModal's
 * footer (`layout="compact"`, label only). Both need the same visibility rule
 * and the same load-and-report-failure sequence, so that logic lives here once
 * rather than being copied with the copy slightly different each time.
 *
 * What happens on success is different in each caller (WelcomeView also has to
 * flip the user into DM mode and start the first-run tour; NewCampaignModal
 * just closes itself), so this component does not decide that — it hands the
 * new campaign back via `loaded` and lets the caller finish the job.
 */
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { IconNavCampaign } from "@/lib/icons";
import { useToast } from "@/composables/useToast";
import { useDemoStatus, useLoadDemoCampaign } from "@/composables/campaign/useDemoCampaign";
import type { Campaign } from "@/types/campaign.types";

const { layout = "full", disabled: externallyDisabled = false } = defineProps<{
  /**
   * `full`: heading-less paragraph + button, for a page. `compact`: button only,
   * for a footer. `menu`: a row in the campaign switcher's action menu.
   */
  layout?: "full" | "compact" | "menu";
  /** Extra condition to disable on top of this component's own mutation, e.g. a sibling form saving. */
  disabled?: boolean;
}>();

const emit = defineEmits<{ loaded: [campaign: Campaign] }>();

const toast = useToast();
const { data: demoStatus } = useDemoStatus();
const { mutateAsync: loadDemo, isPending } = useLoadDemoCampaign();

// Only offered while published and the account has not already loaded one —
// once they have, DangerZoneTab (owned elsewhere) is where they manage it.
const shouldOffer = computed(
  () => demoStatus.value?.published === true && demoStatus.value.demo_campaign_id === null,
);

const isDisabled = computed(() => isPending.value || externallyDisabled);

const OFFER_LABELS = {
  full: "Explore the demo",
  compact: "Load the demo campaign instead",
  menu: "Load demo campaign",
} as const;
const label = computed(() => (isPending.value ? "Setting up the demo…" : OFFER_LABELS[layout]));

async function explore() {
  try {
    const campaign = await loadDemo();
    emit("loaded", campaign);
  } catch (e) {
    toast.error(toast.fromError(e, "Couldn't set up the demo campaign."));
  }
}
</script>
