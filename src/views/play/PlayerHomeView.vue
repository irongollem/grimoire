<template>
  <div class="max-w-3xl mx-auto space-y-8">

    <div>
      <h1 class="text-heading-lg font-bold text-foreground">Adventurer's Rest</h1>
      <p class="text-body text-muted-foreground italic mt-0.5">
        Your characters and campaigns, all in one place.
      </p>
    </div>

    <!-- Your characters -->
    <section data-tour="character-pool" class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <h2 class="font-cinzel text-sm font-semibold text-foreground">Your Characters</h2>
        <AppButton
          data-tour="create-character"
          variant="primary"
          size="sm"
          :icon="IconAdd"
          label="New Character"
          :to="{ name: 'play-character-create' }"
        />
      </div>

      <div v-if="isPendingChars" class="flex justify-center py-8">
        <LoadingSpinner />
      </div>

      <div
        v-else-if="!characters?.length"
        class="rounded-lg border border-border bg-card p-8 text-center space-y-3"
      >
        <IconDM class="h-8 w-8 text-muted-foreground/40 mx-auto" />
        <div>
          <p class="font-cinzel text-sm font-semibold text-foreground">No characters yet</p>
          <p class="text-body text-muted-foreground italic mt-1">
            Create your first character to begin your adventure.
          </p>
        </div>
        <AppButton
          variant="primary"
          size="sm"
          :icon="IconAdd"
          label="Create your first character"
          :to="{ name: 'play-character-create' }"
        />
      </div>

      <div v-else class="grid gap-3 sm:grid-cols-2">
        <CharacterPoolCard
          v-for="char in characters"
          :key="char.id"
          :character="char"
          :attached-campaign="campaignFor(char.campaign_id)"
          :available-campaigns="playerCampaigns"
        />
      </div>
    </section>

    <!-- Your campaigns -->
    <section data-tour="player-campaigns" class="space-y-3">
      <h2 class="font-cinzel text-sm font-semibold text-foreground">Your Campaigns</h2>

      <div v-if="!playerCampaigns.length" class="rounded-lg border border-border bg-card p-6 text-center">
        <p class="text-body text-muted-foreground italic">No campaigns yet — join one with an invite link.</p>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="c in playerCampaigns"
          :key="c.id"
          class="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
        >
          <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ c.name }}</p>
          <AppButton variant="primary" size="sm" label="Play" @click="playCampaign(c)" />
        </div>
      </div>
    </section>

    <!-- Join a campaign -->
    <section data-tour="join-campaign" class="space-y-3">
      <h2 class="font-cinzel text-sm font-semibold text-foreground">Join a Campaign</h2>
      <div class="rounded-lg border border-border bg-card p-4 space-y-2">
        <div class="flex gap-2">
          <AppInput
            v-model="joinInput"
            data-tour="join-code"
            placeholder="Invite link or code"
            class="flex-1 min-w-0"
            @keydown.enter="handleJoin"
          />
          <AppButton variant="primary" size="sm" label="Join" @click="handleJoin" />
        </div>
        <p v-if="joinError" class="text-caption text-destructive">{{ joinError }}</p>
      </div>
    </section>

  </div>
</template>

<script setup lang="ts">
// #729/#730 — the player-mode home. Must render meaningfully for an account
// with no campaign membership at all: an empty character pool, an empty
// campaign list, and the join box are all valid first-visit states.
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { IconAdd, IconDM } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import CharacterPoolCard from "@/components/play/CharacterPoolCard.vue";
import { useCharacterPool } from "@/composables/party/useCharacterPool";
import { usePlayerCampaigns } from "@/composables/campaign/useCampaigns";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import type { Campaign } from "@/types/campaign.types";

const router = useRouter();
const campaignStore = useCampaignStore();
const auth = useAuthStore();

const { data: characters, isPending: isPendingChars } = useCharacterPool();

// Only campaigns where the caller's role is "player" — both the "Your
// Campaigns" list and the per-card attach picker are scoped to these, never
// to campaigns the account DMs. The role scope lives in the query now
// (`usePlayerCampaigns`), so this view and the DM shell cannot answer
// "whose campaign is this?" two different ways.
const { data: playerCampaignData } = usePlayerCampaigns();
const playerCampaigns = computed<Campaign[]>(() => playerCampaignData.value ?? []);

const campaignById = computed(() => {
  const map = new Map<string, Campaign>();
  for (const c of playerCampaigns.value) map.set(c.id, c);
  return map;
});

function campaignFor(id: string | null): Campaign | null {
  return id ? (campaignById.value.get(id) ?? null) : null;
}

async function playCampaign(c: Campaign) {
  campaignStore.switchToCampaign(c);
  await auth.refreshMembership(c.id);
  await router.push({ name: "play" });
}

// ── Join a campaign ──────────────────────────────────────────────────────
// Dialog-scoped transient input — exempt from the Filter State Pattern (it
// isn't a list filter, and reopening this box with a stale code would be a
// bug, not a feature).
const joinInput = ref("");
const joinError = ref("");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function handleJoin() {
  joinError.value = "";
  const raw = joinInput.value.trim();
  if (!raw) {
    joinError.value = "Enter an invite link or code.";
    return;
  }
  const token = raw.includes("/") ? (raw.split("/").filter(Boolean).pop() ?? "") : raw;
  if (!UUID_RE.test(token)) {
    joinError.value = "That doesn't look like a valid invite link or code.";
    return;
  }
  router.push("/join/" + token);
}
</script>
