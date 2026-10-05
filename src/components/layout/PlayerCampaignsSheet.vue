<template>
  <Teleport to="body">
    <Transition name="more-panel">
      <div v-if="open" class="fixed inset-0 z-50 flex flex-col justify-end">
        <div class="absolute inset-0 bg-black/50" @click="open = false" />

        <div class="relative bg-card border-t border-border rounded-t-2xl px-5 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-xl">
          <div class="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-4" />

          <p class="text-label-lg font-semibold text-muted-foreground mb-3">Campaigns</p>

          <div class="space-y-1 mb-3">
            <AppButton
              v-for="c in campaigns"
              :key="c.id"
              variant="menu"
              size="md"
              block
              :active="c.id === campaign.activeCampaignId"
              class="gap-3 rounded-lg"
              @click="switchCampaign(c)"
            >
              <template #icon>
                <span class="h-2 w-2 rounded-full shrink-0"
                  :class="c.id === campaign.activeCampaignId ? 'bg-primary' : 'bg-muted-foreground/30'" />
              </template>
              <div class="flex-1 min-w-0">
                <p class="text-caption font-semibold truncate">{{ c.name }}</p>
                <p class="text-caption text-muted-foreground italic truncate">{{ c.setting }}</p>
              </div>
            </AppButton>

            <p v-if="campaigns.length === 0" class="text-body text-muted-foreground italic px-3 py-2">
              You haven't joined a campaign yet.
            </p>
          </div>

          <div class="border-t border-border pt-3">
            <AppButton variant="menu" size="md" block @click="startCreateCampaign">
              <template #icon><IconAdd class="h-4 w-4 text-muted-foreground shrink-0" /></template>
              <span class="text-label-lg font-semibold text-muted-foreground">New Campaign</span>
            </AppButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <NewCampaignModal
    v-if="newCampaignMounted"
    v-model="showNewCampaignModal"
    @created="onCampaignCreated"
  />
  <PaywallModal v-model="showCampaignPaywall" resource="campaigns" />
</template>

<script setup lang="ts">
/**
 * The player's campaign list as a bottom sheet: pick the campaign in play, or
 * start a new one. The More sheet opens it from its campaign row (as the DM's
 * More sheet opens with its CampaignSwitcher); the shell owns nothing of it.
 */
import { computed, defineAsyncComponent, ref } from "vue";
import { useRouter } from "vue-router";
import { IconAdd } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useLazyMount } from "@/composables/useLazyMount";
import { useModeSwitch } from "@/composables/useModeSwitch";
import { useQuota } from "@/composables/billing/useQuota";
import { usePlayerCampaigns } from "@/composables/campaign/useCampaigns";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import type { Campaign } from "@/types/campaign.types";

const open = defineModel<boolean>("open", { required: true });

const auth = useAuthStore();
const campaign = useCampaignStore();
const router = useRouter();
const { switchMode } = useModeSwitch();

// Deferred here too, and it must stay that way: CampaignSwitcher also defers
// this modal, and a single static importer anywhere drags it back into the
// entry chunk for everyone — that is exactly the ineffective-dynamic-import
// trap #593 was filed for.
const NewCampaignModal = defineAsyncComponent(
  () => import("@/components/campaign/NewCampaignModal.vue"),
);

const showNewCampaignModal = ref(false);
const newCampaignMounted = useLazyMount(showNewCampaignModal);
const showCampaignPaywall = ref(false);

// The player lens lists the campaigns this account *plays in* — never one it
// DMs. The sheet used to list every campaign RLS returned and badge each one
// DM or Player, which let the player shell hand you sideways into a campaign
// the other lens owns (#729 says the mode decides which campaigns are in view).
const { data: campaignList } = usePlayerCampaigns();
const campaigns = computed(() => campaignList.value ?? []);
const { canCreate: canCreateCampaign } = useQuota("campaigns");

async function switchCampaign(c: Campaign) {
  open.value = false;
  campaign.switchToCampaign(c);
  await auth.refreshMembership(c.id);
}

function startCreateCampaign() {
  open.value = false;
  if (!canCreateCampaign.value) { showCampaignPaywall.value = true; return; }
  showNewCampaignModal.value = true;
}

// Creating a campaign from the player shell makes you its DM, so it is a lens
// change and has to go through useModeSwitch — pushing at /dashboard while the
// mode ref still said "player" only got the router guard to bounce you back to
// /play/home with a DM campaign active under the player lens. Mode first, then
// the campaign: switchMode swaps the per-mode memory, so hydrating the new
// campaign before it would file it under the lens being left.
async function onCampaignCreated(c: Campaign) {
  await switchMode("dm", { navigate: false });
  campaign.switchToCampaign(c);
  await auth.refreshMembership(c.id);
  await router.push({ name: "dashboard" });
}
</script>

<style scoped>
.more-panel-enter-active,
.more-panel-leave-active {
  transition: opacity 0.2s ease;
}
.more-panel-enter-from,
.more-panel-leave-to {
  opacity: 0;
}
.more-panel-enter-active .relative,
.more-panel-leave-active .relative {
  transition: transform 0.25s ease;
}
.more-panel-enter-from .relative,
.more-panel-leave-to .relative {
  transform: translateY(100%);
}
</style>
