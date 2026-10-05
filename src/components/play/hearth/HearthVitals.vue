<template>
  <HearthSection title="Vitals">
    <div class="torn bg-card border rounded-lg flex flex-col gap-3 p-3.5">
      <div class="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div class="flex items-baseline gap-1.5" :aria-label="`Hit points ${hp} of ${maxHp}`">
          <span class="hearth-num" :class="hpColor">{{ hp }}</span>
          <span class="text-body text-muted-foreground">/ {{ maxHp }} HP</span>
          <span v-if="member.temp_hp > 0" class="text-label text-tone-info">+{{ member.temp_hp }} temp</span>
        </div>
        <span v-if="wildshape" class="text-label text-muted-foreground">As {{ wildshape.beast_name }}</span>
      </div>

      <div
        class="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        :aria-valuenow="hp"
        aria-valuemin="0"
        :aria-valuemax="maxHp"
        aria-label="Hit points"
      >
        <div class="flex h-full">
          <div class="h-full transition-all" :class="barColor" :style="{ width: `${hpPct}%` }" />
          <div v-if="tempPct > 0" class="h-full bg-tone-info" :style="{ width: `${tempPct}%` }" />
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
import RollToast, { type RollResult } from "@/components/common/RollToast.vue";
import { hpTextClass } from "@/components/player/hpDisplay";
import { useHpDisplay } from "@/composables/play/useHpDisplay";
import { useArmorClass } from "@/composables/party/useArmorClass";
import { usePlayerMonstersByIds } from "@/composables/monsters/usePlayerMonstersByIds";
import { walkingSpeed } from "@/lib/movement";
import { memberInitiativeModifier } from "@/rules/initiative";
import { passiveScore } from "@/rules/skillCheck";
import type { PartyMember } from "@/types/party.types";
import type { WildshapeState } from "@/types/encounter.types";

/**
 * Hit points, the four numbers read at the table, and conditions. Damage, heal
 * and temp HP go through `PlayerHpControls`, the sheet's own control, so Wild
 * Shape, death saves and concentration saves behave exactly as they do there.
 */
const { member } = defineProps<{ member: PartyMember }>();

const { acFor } = useArmorClass();
const lastRoll = ref<RollResult | null>(null);

const wildshape = computed(() => (member.wildshape_state as WildshapeState | null) ?? null);
// A 2024 form keeps the character's own hit points (beast_hp is null).
const hp = computed(() => wildshape.value?.beast_hp ?? member.current_hp);
const maxHp = computed(() => wildshape.value?.beast_max_hp ?? member.max_hp);
const { data: formMonsters } = usePlayerMonstersByIds(() => [wildshape.value?.monster_id]);
const beastSpeed = computed(() => {
  const form = wildshape.value;
  return form ? (formMonsters.value.get(form.monster_id)?.stat_block?.speed ?? null) : null;
});
const hpColor = computed(() => hpTextClass(hp.value, maxHp.value));
const { hpBarColor: barColor } = useHpDisplay(hp, maxHp);
const hpPct = computed(() => (maxHp.value === 0 ? 0 : Math.max(0, Math.min(100, (hp.value / maxHp.value) * 100))));
const tempPct = computed(() =>
  maxHp.value === 0 ? 0 : Math.min(100 - hpPct.value, (member.temp_hp / maxHp.value) * 100),
);

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const stats = computed(() => {
  const speed = (wildshape.value ? walkingSpeed(beastSpeed.value) : null) ?? member.speed;
  return [
    { label: "AC", value: String(wildshape.value?.beast_ac ?? acFor(member)) },
    { label: "Init", value: signed(memberInitiativeModifier(member)) },
    { label: "Speed", value: `${speed} ft` },
    { label: "Passive", value: String(passiveScore(member, "perception")) },
  ];
});
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
