<template>
  <div v-if="blocking" class="flex flex-1 items-center justify-center px-4 py-10">
    <div class="w-full max-w-lg rounded-lg border border-border bg-card px-6 py-8 text-center">
      <IconDM class="mx-auto mb-3 h-10 w-10 text-primary" aria-hidden="true" />
      <h2 class="font-cinzel text-heading-lg font-semibold text-foreground mb-2">
        Start your campaign
      </h2>
      <p class="text-body text-muted-foreground leading-snug">
        DM mode is where you build and run a campaign of your own — its places, NPCs,
        quests and sessions all live inside it. Create one to begin.
      </p>
      <p class="mt-2 text-body text-muted-foreground leading-snug">
        Here to play in someone else's game? Switch to Player — your characters and their
        campaign are there.
      </p>
      <p v-if="hasArchived" class="mt-2 text-caption text-muted-foreground">
        You have archived campaigns too — restore one from the campaign switcher in the
        sidebar.
      </p>

      <div class="mt-6 flex flex-wrap items-center justify-center gap-2">
        <AppButton variant="primary" :icon="IconAdd" label="Create campaign" @click="startCreate" />
        <AppButton variant="outline" :icon="IconUserRound" label="Switch to Player" @click="toPlayer" />
      </div>

      <!-- The demo never counts toward the campaign quota, so it is offered here
           whether or not Create campaign would hit the paywall (#912). -->
      <DemoCampaignOffer layout="full" @loaded="onCreated" />
    </div>

    <NewCampaignModal
      v-if="newCampaignMounted"
      v-model="showModal"
      show-claim-option
      @created="onCreated"
    />
    <PaywallModal v-model="showPaywall" resource="campaigns" />
  </div>
  <slot v-else />
</template>

<script setup lang="ts">
/**
 * DM mode requires a campaign.
 *
 * Every DM surface is campaign-scoped, so the DM shell without one is not an
 * empty state — it is a broken one. An account that plays in someone else's
 * game and clicked "DM" landed on a dashboard of empty widgets (#845, which
 * answered it with a notice on the dashboard alone) and could still walk into
 * the Atlas and try to build there, where nothing it made had a campaign to
 * belong to. So this stands in for the page itself, on every DM route, and
 * opens the new-campaign flow straight away: the two ways forward are to make
 * a campaign or to switch lens, and both are one click.
 *
 * Account-scoped routes (`meta.accountScoped` — billing, the account page) and
 * admin routes pass through, because they hold no campaign and the one thing a
 * campaign-less DM may need is exactly those pages. Opt-in rather than derived
 * so a route added later is gated by default.
 *
 * Only a *resolved* empty list blocks: `data` is `undefined` while it loads,
 * and gating a real DM behind "start your campaign" for the length of a fetch
 * would be worse than the bug this fixes.
 */
import { computed, defineAsyncComponent, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { IconAdd, IconDM, IconUserRound } from "@/lib/icons";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useModeSwitch } from "@/composables/useModeSwitch";
import { useLazyMount } from "@/composables/useLazyMount";
import { useQuota } from "@/composables/billing/useQuota";
import { useDmArchivedCampaigns, useDmCampaigns } from "@/composables/campaign/useCampaigns";
import type { Campaign } from "@/types/campaign.types";

// Async for the same reason CampaignSwitcher's is: the modal is heavy, and a
// static import here would put it in the entry chunk of every DM page (#593).
const NewCampaignModal = defineAsyncComponent(
  () => import("@/components/campaign/NewCampaignModal.vue"),
);
const DemoCampaignOffer = defineAsyncComponent(
  () => import("@/components/campaign/DemoCampaignOffer.vue"),
);

const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const campaignStore = useCampaignStore();
const { switchMode } = useModeSwitch();
const { canCreate } = useQuota("campaigns");
const { data: dmCampaigns, isSuccess } = useDmCampaigns();
const { data: archived } = useDmArchivedCampaigns();

const blocking = computed(
  () =>
    ui.userMode === "dm" &&
    !route.meta.accountScoped &&
    !route.meta.requiresAdmin &&
    isSuccess.value &&
    dmCampaigns.value?.length === 0,
);
const hasArchived = computed(() => (archived.value?.length ?? 0) > 0);

const showModal = ref(false);
const showPaywall = ref(false);
const newCampaignMounted = useLazyMount(showModal);

function startCreate() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  showModal.value = true;
}

// Spawn the flow the moment the gate appears, rather than making the DM find
// the button first. Once only: closing the modal is an answer, and reopening
// it on them would be nagging — the button stays for when they change their mind.
let offered = false;
watch(
  blocking,
  (isBlocking) => {
    if (!isBlocking || offered) return;
    offered = true;
    startCreate();
  },
  { immediate: true },
);

async function onCreated(campaign: Campaign) {
  campaignStore.switchToCampaign(campaign);
  await router.push({ name: "dashboard" });
}

async function toPlayer() {
  await switchMode("player");
}
</script>
