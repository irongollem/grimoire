<template>
  <div>
    <h2 class="text-heading-lg font-semibold text-foreground mb-1">What are you?</h2>
    <p class="text-body text-muted-foreground italic mb-6">
      This decides where you land when you sign in — you can switch anytime.
    </p>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <AppButton variant="outline" size="lg" block data-tour="choose-dm" @click="choose('dm')">
        <span class="flex flex-col items-center gap-2 py-3 text-center">
          <IconDM class="h-8 w-8 shrink-0 text-primary" aria-hidden="true" />
          <span class="text-heading-sm">DM</span>
          <span class="text-body font-normal text-muted-foreground">
            I want to start building my campaign
          </span>
        </span>
      </AppButton>

      <AppButton variant="outline" size="lg" block data-tour="choose-player" @click="choose('player')">
        <span class="flex flex-col items-center gap-2 py-3 text-center">
          <IconUserRound class="h-8 w-8 shrink-0 text-primary" aria-hidden="true" />
          <span class="text-heading-sm">Player</span>
          <span class="text-body font-normal text-muted-foreground">
            I want to build my character
          </span>
        </span>
      </AppButton>
    </div>

    <DemoCampaignOffer layout="full" @loaded="onDemoLoaded" />
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import DemoCampaignOffer from "@/components/campaign/DemoCampaignOffer.vue";
import { IconDM, IconUserRound } from "@/lib/icons";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { TOUR_FLAG_KEY } from "@/lib/tours/firstRunTours";
import type { Campaign } from "@/types/campaign.types";

const ui = useUiStore();
const router = useRouter();
const campaignStore = useCampaignStore();

function choose(mode: "dm" | "player") {
  ui.userMode = mode;
  // A separate tour runner reads this to launch the first-run walkthrough.
  localStorage.setItem(TOUR_FLAG_KEY, mode);
  router.push({ name: mode === "dm" ? "dashboard" : "play-home" });
}

async function onDemoLoaded(campaign: Campaign) {
  // Same as choosing DM: the first-run tour should run over the demo's real
  // content rather than an empty dashboard.
  ui.userMode = "dm";
  localStorage.setItem(TOUR_FLAG_KEY, "dm");
  campaignStore.switchToCampaign(campaign);
  await router.push({ name: "dashboard" });
}
</script>
