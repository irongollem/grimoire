<template>
  <div class="pb-8">
    <div v-if="!member" class="text-center py-16">
      <p class="font-fell text-sm text-muted-foreground italic">No character linked.</p>
    </div>
    <LevelUpWizard v-else :member="member" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useParty } from "@/composables/useParty";
import LevelUpWizard from "@/levelup/LevelUpWizard.vue";

const auth = useAuthStore();
const { data: partyMembers } = useParty();

const member = computed(() =>
  auth.linkedPartyMemberId && partyMembers.value
    ? (partyMembers.value.find((m) => m.id === auth.linkedPartyMemberId) ?? null)
    : null,
);
</script>
