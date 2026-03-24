<template>
  <PageHeader title="Settings" description="Your profile for this campaign">
  <div class="max-w-lg space-y-8">

    <!-- Display name -->
    <section class="rounded-lg border border-border bg-card p-5 space-y-4">
      <h2 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">Display Name</h2>
      <p class="font-fell text-sm text-muted-foreground italic">
        This is how your DM and party members see you in the campaign.
        It defaults to your email address.
      </p>

      <form class="flex gap-2" @submit.prevent="saveName">
        <input
          v-model="displayName"
          type="text"
          maxlength="60"
          placeholder="Your name…"
          class="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          :disabled="savingName || !displayName.trim() || displayName.trim() === currentName"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          <Check v-if="nameSaved" class="h-3.5 w-3.5" />
          <Save v-else class="h-3.5 w-3.5" />
          {{ nameSaved ? "Saved" : "Save" }}
        </button>
      </form>

      <p v-if="nameError" class="font-fell text-xs text-destructive">{{ nameError }}</p>
    </section>

    <!-- Character claim -->
    <section class="rounded-lg border border-border bg-card p-5 space-y-4">
      <h2 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">My Character</h2>

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
          Claim a character to link your account to a party member.
        </p>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 font-cinzel text-xs text-primary hover:bg-primary/20 transition-colors"
          @click="showClaim = true"
        >
          <User class="h-3.5 w-3.5" />
          Claim a character
        </button>
      </div>

      <!-- Claim picker -->
      <div v-if="showClaim" class="border border-border rounded-md p-3 space-y-3 bg-background">
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
            <Check class="h-3.5 w-3.5" />
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
    </section>

    <!-- Account info (read-only) -->
    <section class="rounded-lg border border-border bg-card p-5 space-y-2">
      <h2 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">Account</h2>
      <div class="flex items-center gap-2">
        <span class="font-fell text-xs text-muted-foreground w-16">Email</span>
        <span class="font-fell text-sm text-foreground">{{ auth.userEmail ?? '—' }}</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="font-fell text-xs text-muted-foreground w-16">Role</span>
        <span class="font-cinzel text-xs tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary">
          {{ auth.currentRole ?? '—' }}
        </span>
      </div>
    </section>
  </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Check, Save, User } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import { useAuthStore } from "@/stores/auth";
import { useParty } from "@/composables/useParty";
import { useCampaignMembers } from "@/composables/useCampaignMembers";
import { supabase } from "@/lib/supabase";

const auth = useAuthStore();
const { data: partyMembers } = useParty();
const { data: campaignMembers } = useCampaignMembers();

// ── Display name ──────────────────────────────────────────────────────────────
const currentName = computed(() => auth.membership?.display_name ?? "");
const displayName = ref(currentName.value);
const savingName = ref(false);
const nameSaved = ref(false);
const nameError = ref<string | null>(null);

async function saveName() {
  if (!auth.membership?.id || !displayName.value.trim()) return;
  savingName.value = true;
  nameError.value = null;
  nameSaved.value = false;

  const { error: err } = await supabase
    .from("campaign_members")
    .update({ display_name: displayName.value.trim() })
    .eq("id", auth.membership.id);

  savingName.value = false;

  if (err) {
    nameError.value = err.message;
  } else {
    if (auth.membership) auth.membership = { ...auth.membership, display_name: displayName.value.trim() };
    nameSaved.value = true;
    setTimeout(() => { nameSaved.value = false; }, 2000);
  }
}

// ── Character claim ───────────────────────────────────────────────────────────
const showClaim = ref(false);
const claimTarget = ref<string | null>(null);
const claimingChar = ref(false);
const claimError = ref<string | null>(null);

// Party members not yet claimed by any other player
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
