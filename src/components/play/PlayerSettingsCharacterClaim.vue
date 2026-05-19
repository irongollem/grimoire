<template>
  <SettingsSection title="My Character">
    <div v-if="linkedCharacter" class="flex items-center gap-3">
      <div class="flex-1">
        <p class="font-cinzel text-sm font-semibold text-foreground">{{ linkedCharacter.name }}</p>
        <p class="font-fell text-xs text-muted-foreground italic">
          {{ linkedCharacter.class }} {{ linkedCharacter.level > 0 ? `· Level ${linkedCharacter.level}` : '' }}
        </p>
      </div>
      <button
        type="button"
        class="font-cinzel text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1 transition-colors"
        @click="showClaim = true"
      >
        Change
      </button>
    </div>

    <div v-else>
      <p class="font-fell text-sm text-muted-foreground italic mb-3">
        Build your own character sheet, or claim an existing party member created by your DM.
      </p>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          to="/play/character/create"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          <IconUser class="h-3.5 w-3.5" />
          Create character
        </RouterLink>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 font-cinzel text-xs text-primary hover:bg-primary/20 transition-colors"
          @click="showClaim = true"
        >
          Claim existing
        </button>
      </div>
    </div>

    <!-- Claim picker -->
    <div v-if="showClaim" class="border border-border rounded-md p-3 space-y-3 bg-background mt-4">
      <p class="font-cinzel text-xs text-muted-foreground tracking-wide">Select your character:</p>
      <div v-if="unclaimedMembers.length === 0" class="font-fell text-sm text-muted-foreground italic">
        No unclaimed characters available. Ask your DM to add one.
      </div>
      <div v-else class="space-y-1.5">
        <button
          v-for="m in unclaimedMembers"
          :key="m.id"
          type="button"
          class="w-full text-left rounded px-3 py-2 border transition-colors"
          :class="claimTarget === m.id
            ? 'border-primary/50 bg-primary/10 text-foreground'
            : 'border-border bg-card hover:border-primary/30'"
          @click="claimTarget = m.id"
        >
          <span class="font-cinzel text-sm font-semibold">{{ m.name }}</span>
          <span class="font-fell text-xs text-muted-foreground ml-2">
            {{ m.class }} {{ m.level > 0 ? `· Lv ${m.level}` : '' }}
          </span>
        </button>
      </div>
      <div class="flex gap-2">
        <button
          type="button"
          :disabled="!claimTarget || claimingChar"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 disabled:opacity-40 transition-opacity"
          @click="claimCharacter"
        >
          <IconCheck class="h-3.5 w-3.5" />
          Claim
        </button>
        <button
          type="button"
          class="rounded-md border border-border px-3 py-1.5 font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors"
          @click="showClaim = false; claimTarget = null"
        >
          Cancel
        </button>
      </div>
      <p v-if="claimError" class="font-fell text-xs text-destructive">{{ claimError }}</p>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink } from "vue-router";
import SettingsSection from "@/components/common/SettingsSection.vue";
import { IconCheck, IconUser } from "@/lib/icons";
import { useAuthStore } from "@/stores/auth";
import { useParty } from "@/composables/useParty";
import { useCampaignMembers } from "@/composables/useCampaignMembers";
import { supabase } from "@/lib/supabase";

const auth = useAuthStore();
const { data: partyMembers } = useParty();
const { data: campaignMembers } = useCampaignMembers();

const showClaim = ref(false);
const claimTarget = ref<string | null>(null);
const claimingChar = ref(false);
const claimError = ref<string | null>(null);

const unclaimedMembers = computed(() => {
  const allMembers = partyMembers.value ?? [];
  const claimedIds = new Set(
    (campaignMembers.value ?? [])
      .filter(m => m.party_member_id && m.user_id !== auth.user?.id)
      .map(m => m.party_member_id!)
  );
  return allMembers.filter(m => !claimedIds.has(m.id));
});

const linkedCharacter = computed(() => {
  if (!auth.linkedPartyMemberId || !partyMembers.value) return null;
  return partyMembers.value.find(m => m.id === auth.linkedPartyMemberId) ?? null;
});

async function claimCharacter() {
  if (!auth.membership?.id || !claimTarget.value) return;
  claimingChar.value = true;
  claimError.value = null;

  const { error: err } = await supabase
    .from("campaign_members")
    .update({ party_member_id: claimTarget.value })
    .eq("id", auth.membership.id);

  claimingChar.value = false;

  if (err) {
    claimError.value = err.message;
  } else {
    if (auth.membership) {
      auth.membership = { ...auth.membership, party_member_id: claimTarget.value };
    }
    showClaim.value = false;
    claimTarget.value = null;
  }
}
</script>
