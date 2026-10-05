<template>
  <div class="flex flex-col gap-4">
    <!-- Welcome: an empty state with its ink stain -->
    <section class="torn hearth-card ink-seep rounded-lg p-4" :style="inkStyle" aria-labelledby="hearth-welcome">
      <h2 id="hearth-welcome" class="hearth-display text-heading">Welcome to the table</h2>
      <p class="mt-1.5 text-body text-muted-foreground">
        You have a seat at {{ campaignName }}. Two things before the first session, and the rest gathers
        here as your DM shares it.
      </p>
    </section>

    <!-- Step I: a character -->
    <section class="torn hearth-card rounded-lg p-4" aria-labelledby="hearth-step-character">
      <div class="flex items-start gap-3">
        <span class="step" aria-hidden="true">I</span>
        <div>
          <h3 id="hearth-step-character" class="text-body font-semibold">Choose your character</h3>
          <p class="text-caption text-muted-foreground">
            {{ unclaimed.length > 0 ? "Claim one your DM prepared, or make your own." : "Make your own character." }}
          </p>
        </div>
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <AppButton v-if="unclaimed.length > 0" to="/play/settings" variant="primary" size="md" label="Claim a character" />
        <AppButton
          to="/play/character/create"
          :variant="unclaimed.length > 0 ? 'outline' : 'primary'"
          size="md"
          label="Make my own"
        />
      </div>
      <p v-if="unclaimed.length > 0" class="mt-2 text-caption italic text-muted-foreground">
        {{ unclaimed.length }} {{ unclaimed.length === 1 ? "character is" : "characters are" }} waiting to be claimed.
      </p>
    </section>

    <!-- Step II: the first session -->
    <div class="flex items-start gap-3">
      <span class="step mt-4" aria-hidden="true">II</span>
      <HearthNextSession invite class="min-w-0 flex-1" />
    </div>

    <!-- What will gather here -->
    <HearthSection title="Still to come">
      <ul class="flex flex-col gap-1.5 px-1">
        <li v-for="line in STILL_TO_COME" :key="line" class="flex items-baseline gap-2.5 text-body text-muted-foreground">
          <i class="inline-block h-1.5 w-1.5 shrink-0 rotate-45 bg-primary" aria-hidden="true" />{{ line }}
        </li>
      </ul>
    </HearthSection>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import HearthNextSession from "@/components/play/hearth/HearthNextSession.vue";
import HearthSection from "@/components/play/hearth/HearthSection.vue";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import { useParty } from "@/composables/party/useParty";
import { inkSeepStyle } from "@/lib/inkSeep";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";

/**
 * A seated player with no character yet: a welcome, the one choice that
 * matters (claim a prepared character or make one), the first session's RSVP,
 * and a promise of what will gather here. Claiming itself lives in Settings,
 * which is where "Claim a character" leads.
 */
const STILL_TO_COME = [
  "Handouts your DM shares with you",
  "The quests the party takes on",
  "Your notes, and the day it is in the realm",
];

const auth = useAuthStore();
const campaign = useCampaignStore();
const { data: party } = useParty();
const { data: members } = useCampaignMembers();

const campaignName = computed(() => campaign.activeCampaign?.name ?? "the table");
const inkStyle = computed(() => inkSeepStyle("hearth-welcome"));

// Same rule as PlayerSettingsCharacterClaim: a character is claimable until
// another player's seat points at it.
const unclaimed = computed(() => {
  const taken = new Set(
    (members.value ?? [])
      .filter((m) => m.party_member_id && m.user_id !== auth.user?.id)
      .map((m) => m.party_member_id),
  );
  return (party.value ?? []).filter((p) => !taken.has(p.id));
});
</script>

<style scoped>
.hearth-display {
  font-family: "Cinzel", Georgia, serif;
}

/* A roman numeral in a small ringed plate: the step, not a button. */
.step {
  display: inline-flex;
  height: 1.75rem;
  width: 1.75rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--live-ink, var(--primary));
  border-radius: 9999px;
  font-family: "Cinzel", Georgia, serif;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--live-ink, var(--primary));
}
</style>
