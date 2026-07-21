<template>
  <div class="pb-8 space-y-6">
    <div v-if="!member" class="text-center py-16">
      <p class="text-body text-muted-foreground italic">No character linked.</p>
    </div>
    <template v-else>
      <LevelUpWizard
        :key="member.level"
        :member="member"
        :target-level="targetLevel"
        :back-route="backRoute"
      />
      <DeLevelPanel
        v-if="characterClasses && characterClasses.length > 0"
        :member="member"
        :character-classes="characterClasses"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useParty } from "@/composables/useParty";
import { useCharacterClasses } from "@/composables/useCharacterClasses";
import LevelUpWizard from "@/levelup/LevelUpWizard.vue";
import DeLevelPanel from "@/components/levelup/DeLevelPanel.vue";

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

const { data: characterClasses } = useCharacterClasses(memberId);

const targetLevel = computed(() => {
  const raw = route.query.targetLevel as string | undefined;
  const n = raw ? parseInt(raw, 10) : NaN;
  return isNaN(n) ? undefined : n;
});

// Decide the return route by ROLE, not by memberId presence: a regular player
// levelling their own character also carries a memberId (their own, and it's
// re-appended across the multi-level loop), so keying on memberId would send
// them to the DM-only /party. DMs return to the party roster; players to /play.
const backRoute = auth.isDM ? "/party" : "/play";
</script>
