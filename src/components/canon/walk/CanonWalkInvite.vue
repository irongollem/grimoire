<template>
  <section class="mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-lg border border-border bg-card p-4" data-testid="canon-walk-invite">
    <header class="flex flex-col gap-1">
      <h2 class="m-0 font-display text-title">Your campaign's background book</h2>
      <p class="m-0 text-body text-muted-foreground">
        Everything about your world that is not a person, a place, a quest or a faction goes here. Design it with me, in the Familiar, asks about every section; write each one, let the Familiar draft it, or skip it.
      </p>
    </header>
    <div class="flex flex-wrap items-center gap-2">
      <AppButton variant="primary" size="md" label="Design it with me" data-testid="walk-invite-start" @click="askUi.openWalk()" />
      <AppButton to="/canon/import" variant="outline" size="md" label="Bring in a book you have" />
      <AppButton variant="subtle" size="md" label="Not now" data-testid="walk-invite-dismiss" @click="dismiss" />
    </div>
  </section>
</template>

<script setup lang="ts">
/** The Canon's invitation to the walk, above the Premise chapter and never in place of it. "Not now" is kept per campaign. */
import AppButton from "@/components/common/controls/AppButton.vue";
import { useCampaignStore } from "@/stores/campaign";
import { useAskUiStore } from "@/stores/ui/ask";
import { useCanonUiStore } from "@/stores/ui/canon";

const store = useCanonUiStore();
const askUi = useAskUiStore();
const campaign = useCampaignStore();
function dismiss() {
  if (campaign.activeCampaignId === null) return;
  store.walkInviteDismissed = { ...store.walkInviteDismissed, [campaign.activeCampaignId]: true };
}
</script>
