<template>
  <div class="min-h-screen bg-background flex items-center justify-center px-4">
    <div class="w-full max-w-lg text-center space-y-6">
      <!-- Header -->
      <div>
        <h1 class="font-cinzel text-3xl font-bold text-gold-500 tracking-widest drop-shadow-lg">
          Grimoire
        </h1>
        <p class="font-fell text-muted-foreground italic mt-1">Player Portal</p>
      </div>

      <!-- Welcome card -->
      <div class="rounded-lg border border-border bg-card p-8 shadow-gold-glow text-left space-y-4">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <span class="font-cinzel text-primary font-bold text-lg">
              {{ initials }}
            </span>
          </div>
          <div>
            <p class="font-cinzel text-foreground font-semibold">
              {{ auth.membership?.display_name || auth.userEmail }}
            </p>
            <p class="font-fell text-xs text-muted-foreground italic">
              {{ characterName ? `Playing ${characterName}` : 'No character linked yet' }}
            </p>
          </div>
        </div>

        <hr class="border-border" />

        <div class="space-y-2">
          <p class="font-fell text-sm text-muted-foreground italic">
            Your DM is setting up the player features — they'll be ready soon. For now you're
            successfully connected to the campaign.
          </p>

          <div class="rounded-md border border-border bg-muted/40 px-4 py-3 flex items-center gap-2">
            <div class="h-2 w-2 rounded-full bg-elven-green shrink-0" />
            <p class="font-fell text-sm text-foreground">Connected to campaign</p>
          </div>
        </div>
      </div>

      <!-- Sign out -->
      <button
        class="font-fell text-sm text-muted-foreground hover:text-foreground underline"
        @click="handleSignOut"
      >
        Sign out
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useParty } from "@/composables/useParty";

const auth = useAuthStore();
const router = useRouter();
const { data: partyMembers } = useParty();

const initials = computed(() => {
  const name = auth.membership?.display_name || auth.userEmail || "?";
  return name.slice(0, 2).toUpperCase();
});

const characterName = computed(() => {
  if (!auth.linkedPartyMemberId || !partyMembers.value) return null;
  const member = partyMembers.value.find((m) => m.id === auth.linkedPartyMemberId);
  return member?.name ?? null;
});

async function handleSignOut() {
  await auth.signOut();
  router.push({ name: "login" });
}
</script>
