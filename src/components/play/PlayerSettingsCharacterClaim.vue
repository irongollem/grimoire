<template>
  <SettingsSection title="My Character">
    <div v-if="linkedCharacter" class="flex items-center gap-3">
      <div class="flex-1">
        <p class="font-cinzel text-sm font-semibold text-foreground">{{ linkedCharacter.name }}</p>
        <p class="text-caption text-muted-foreground italic">
          {{ linkedCharacter.class }} {{ linkedCharacter.level > 0 ? `· Level ${linkedCharacter.level}` : '' }}
        </p>
      </div>
      <AppButton variant="subtle" size="sm" label="Change" @click="showClaim = true" />
    </div>

    <div v-else>
      <p class="text-body text-muted-foreground italic mb-3">
        Build your own character sheet, or claim an existing party member created by your DM.
      </p>
      <div class="flex flex-wrap gap-2">
        <AppButton to="/play/character/create" variant="primary" size="sm" :icon="IconUser" label="Create character" />
        <AppButton variant="tinted" tone="primary" emphasis="soft" size="sm" label="Claim existing" @click="showClaim = true" />
      </div>
    </div>

    <!-- Claim picker -->
    <div v-if="showClaim" class="border border-border rounded-md p-3 space-y-3 bg-background mt-4">
      <p class="font-cinzel text-xs text-muted-foreground tracking-wide">Select your character:</p>
      <div v-if="unclaimedMembers.length === 0" class="text-body text-muted-foreground italic">
        No unclaimed characters available. Ask your DM to add one.
      </div>
      <div v-else class="space-y-1.5">
        <AppButton
          v-for="m in unclaimedMembers"
          :key="m.id"
          variant="menu" size="sm" block
          :active="claimTarget === m.id"
          @click="claimTarget = m.id"
        >
          <span class="font-cinzel text-sm font-semibold">{{ m.name }}</span>
          <span class="text-caption text-muted-foreground ml-2">
            {{ m.class }} {{ m.level > 0 ? `· Lv ${m.level}` : '' }}
          </span>
        </AppButton>
      </div>
      <div class="flex gap-2">
        <AppButton
          variant="primary" size="sm"
          :icon="IconCheck"
          label="Claim"
          :disabled="!claimTarget || claimingChar"
          @click="claimCharacter"
        />
        <AppButton variant="subtle" size="sm" label="Cancel" @click="showClaim = false; claimTarget = null" />
      </div>
      <p v-if="claimError" class="text-caption text-destructive">{{ claimError }}</p>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import SettingsSection from "@/components/common/SettingsSection.vue";
import AppButton from "@/components/common/AppButton.vue";
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
