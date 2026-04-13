<template>
  <div class="pb-8">
    <div v-if="!member" class="text-center py-16">
      <p class="font-fell text-sm text-muted-foreground italic">No character linked.</p>
    </div>
    <LevelUpWizard v-else :member="member" :back-route="backRoute" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useParty } from "@/composables/useParty";
import LevelUpWizard from "@/levelup/LevelUpWizard.vue";

const route = useRoute();
const auth = useAuthStore();
const { data: partyMembers } = useParty();

const memberId = computed(() =>
  (route.query.memberId as string | undefined) ?? auth.linkedPartyMemberId ?? null,
);

const member = computed(() =>
  memberId.value && partyMembers.value
    ? (partyMembers.value.find((m) => m.id === memberId.value) ?? null)
    : null,
);

const backRoute = (route.query.memberId as string | undefined) ? "/party" : "/play";
</script>
