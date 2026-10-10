<template>
  <HearthSection title="Vitals">
    <div class="torn bg-card border rounded-lg flex flex-col gap-3 p-3.5">
      <div class="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div class="flex items-baseline gap-1.5" :aria-label="`Hit points ${hp.current} of ${hp.max}`">
          <span class="hearth-num" :class="hp.textClass">{{ hp.current }}</span>
          <span class="text-body text-muted-foreground">/ {{ hp.max }} HP</span>
          <span v-if="hp.temp > 0" class="text-label text-tone-info">+{{ hp.temp }} temp</span>
        </div>
        <span v-if="wildshape" class="text-label text-muted-foreground">As {{ wildshape.beast_name }}</span>
      </div>

      <div
        class="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        :aria-valuenow="hp.current"
        aria-valuemin="0"
        :aria-valuemax="hp.max"
        aria-label="Hit points"
      >
        <div class="flex h-full">
          <div class="h-full transition-all" :class="hp.barClass" :style="{ width: `${hp.pct}%` }" />
          <div v-if="hp.tempPct > 0" class="h-full bg-tone-info" :style="{ width: `${hp.tempPct}%` }" />
        </div>
      </div>

      <PlayerHpControls :member="member" :wildshape="wildshape ?? undefined" />

      <dl class="grid grid-cols-4 gap-2">
        <div v-for="s in stats" :key="s.label" class="flex flex-col items-center rounded-md border border-border py-1.5">
          <dd class="hearth-num-sm">{{ s.value }}</dd>
          <dt class="text-eyebrow text-muted-foreground">{{ s.label }}</dt>
        </div>
      </dl>

      <div v-if="member.conditions.length" class="flex flex-wrap items-center gap-1.5">
        <PlayerConditions :member="member" @roll="lastRoll = { ...$event }" />
      </div>

      <RouterLink :to="{ name: 'play-character' }" class="hearth-link">Full character sheet</RouterLink>
    </div>
    <RollToast :result="lastRoll" />
  </HearthSection>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import HearthSection from "./HearthSection.vue";
import PlayerConditions from "@/components/player/PlayerConditions.vue";
import PlayerHpControls from "@/components/player/PlayerHpControls.vue";
import RollToast, { type RollResult } from "@/components/common/feedback/RollToast.vue";
import { useMemberVitals } from "@/composables/party/useMemberVitals";
import type { PartyMember } from "@/types/party.types";

/**
 * Hit points, the four numbers read at the table, and conditions. Damage, heal
 * and temp HP go through `PlayerHpControls`, the sheet's own control, so Wild
 * Shape, death saves and concentration saves behave exactly as they do there.
 */
const { member } = defineProps<{ member: PartyMember }>();

const lastRoll = ref<RollResult | null>(null);

const { wildshape, armorClass, initiative, speed, passivePerception, hp } = useMemberVitals(() => member);

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const stats = computed(() => [
  { label: "AC", value: String(armorClass.value) },
  { label: "Init", value: signed(initiative.value) },
  { label: "Speed", value: `${speed.value} ft` },
  { label: "Passive", value: String(passivePerception.value) },
]);
</script>

<style scoped>
.hearth-num {
  font-family: "Cinzel", Georgia, serif;
  font-size: 2.5rem;
  font-weight: 700;
  line-height: 1;
}

.hearth-num-sm {
  margin: 0;
  font-family: "Cinzel", Georgia, serif;
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.2;
}

.hearth-link {
  align-self: flex-start;
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--live-ink, var(--primary));
  text-decoration: underline;
  text-underline-offset: 0.2em;
}
</style>
