<template>
  <section class="flex flex-col gap-4 px-4 py-3.5" aria-label="Your character" data-testid="solo-sheet">
    <header class="flex items-center gap-3">
      <div class="relative size-14 shrink-0 overflow-hidden rounded-md bg-muted/50">
        <FocalImage v-if="portrait.src && !lowArt" :src="portrait.src" :alt="portrait.alt" format="portrait" :focal-point="portrait.focalPoint" record />
        <span v-else class="absolute inset-0 flex items-center justify-center text-heading font-bold text-muted-foreground" aria-hidden="true">{{ displayName.charAt(0) }}</span>
      </div>
      <div class="min-w-0">
        <h2 class="truncate text-heading-sm font-bold text-foreground">{{ displayName }}</h2>
        <p class="text-caption text-muted-foreground">Level {{ member.level }}</p>
        <!-- When the party level (or the character's XP) has passed it, Level Up is taken from here; the sitting stays
             open meanwhile and goes on at the new level (#1021 row 27). -->
        <AppButton
          v-if="!readonly && levelUp !== null"
          :to="{ name: 'play-character-levelup', query: { memberId: member.id } }"
          variant="link"
          size="inline-caption"
          label="Ready to level up"
        />
      </div>
    </header>

    <div class="flex flex-col gap-1.5">
      <span class="text-eyebrow text-muted-foreground">Hit points</span>
      <div class="flex items-baseline gap-1.5" :aria-label="`Hit points ${hp.current} of ${hp.max}`">
        <span class="text-display font-bold tabular-nums" :class="hp.textClass">{{ hp.current }}</span>
        <span class="text-body text-muted-foreground">of {{ hp.max }}</span>
        <span v-if="hp.temp > 0" class="text-label text-tone-info">+{{ hp.temp }} temp</span>
      </div>
      <div class="h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Hit points" :aria-valuenow="hp.current" aria-valuemin="0" :aria-valuemax="hp.max">
        <div class="h-full rounded-full" :class="hp.barClass" :style="{ width: `${hp.pct}%` }" />
      </div>
      <!-- The same control the Hearth and the sheet use, so temporary hit points and death saves behave as everywhere. -->
      <PlayerHpControls v-if="!readonly" compact :member="member" :wildshape="wildshape ?? undefined" />
    </div>

    <dl class="grid grid-cols-4 gap-2">
      <div v-for="s in stats" :key="s.label" class="flex flex-col items-center rounded-md border border-border py-1.5">
        <dd class="text-heading-sm font-bold tabular-nums">{{ s.value }}</dd>
        <dt class="text-eyebrow text-muted-foreground">{{ s.label }}</dt>
      </div>
    </dl>

    <div class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">Conditions</span>
      <p v-if="conditionNames.length === 0" class="text-body text-muted-foreground">None</p>
      <ul v-else class="flex flex-wrap gap-x-3 gap-y-1 text-body text-ink-caution">
        <li v-for="name in conditionNames" :key="name">{{ name }}</li>
      </ul>
    </div>

    <div v-if="member.spell_slots.some((s) => s.max > 0)" class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">Spell slots</span>
      <PlayerSpellSlotStrip :spell-slots="member.spell_slots" :disabled="readonly" @set-used="(slot, used) => writeSlot(member, slot, used)" />
    </div>

    <div v-if="skills.length" class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">Checks</span>
      <ul class="flex flex-col gap-0.5">
        <li v-for="s in skills" :key="s.key" class="flex items-baseline justify-between gap-2 text-body">
          <span>{{ s.label }}</span>
          <span class="font-semibold tabular-nums">{{ signed(s.bonus) }}</span>
        </li>
      </ul>
    </div>

    <!-- The sitting stays open when the player leaves for the sheet: the table's page is not left, only its sitting's view. -->
    <AppButton to="/play/character" variant="link" size="inline" label="Open the full sheet" class="self-start" />
  </section>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import PlayerHpControls from "@/components/player/PlayerHpControls.vue";
import PlayerSpellSlotStrip from "@/components/spells/PlayerSpellSlotStrip.vue";
import { useJackOfAllTrades } from "@/composables/party/useJackOfAllTrades";
import { useLevelUp } from "@/composables/party/useLevelUp";
import { useMemberVitals } from "@/composables/party/useMemberVitals";
import { useSpellSlotWrite } from "@/composables/spells/useSpellSlotWrite";
import { useLowArt } from "@/composables/useLowArt";
import { formPortrait } from "@/lib/wildshapePortrait";
import { getExhaustionLevel, isExhaustion } from "@/rules/conditions";
import { skillCheckBonus } from "@/rules/skillCheck";
import { SKILLS } from "@/types/party.types";
import type { PartyMember } from "@/types/party.types";

/**
 * The played character at a glance, from the Solo Table design: the Hearth's own numbers (`useMemberVitals`,
 * `PlayerHpControls`, `PlayerSpellSlotStrip`) laid out as a column. Everything on it is the player's own, so nothing is
 * withheld. `readonly` is a sitting that has ended: the numbers stay readable and nothing can be changed from here.
 */
const { member, readonly = false } = defineProps<{ member: PartyMember; readonly?: boolean }>();
// The bar keeps hit points in sight on every tab; the form's own pool while Wild Shaped is what `hp` already is.
const emit = defineEmits<{ "hit-points": [now: { current: number; max: number }] }>();

const { lowArt } = useLowArt();
const { wildshape, beastMonster, armorClass, initiative, speed, hp } = useMemberVitals(() => member);
const { jack } = useJackOfAllTrades(() => member);
const { action: levelUp } = useLevelUp(() => member);
const { setSlotUsed: writeSlot } = useSpellSlotWrite();

watch(() => [hp.value.current, hp.value.max], () => emit("hit-points", { current: hp.value.current, max: hp.value.max }), { immediate: true });

const displayName = computed(() => wildshape.value?.beast_name ?? member.name);
const portrait = computed(() => formPortrait(member, wildshape.value, beastMonster.value?.image_url));

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
const stats = computed(() => [
  { label: "AC", value: String(armorClass.value) },
  { label: "Speed", value: `${speed.value} ft` },
  { label: "Init", value: signed(initiative.value) },
  { label: "Prof", value: signed(member.proficiency_bonus) },
]);

const conditionNames = computed(() => [
  ...(getExhaustionLevel(member.conditions) > 0 ? [`Exhaustion ${getExhaustionLevel(member.conditions)}`] : []),
  ...member.conditions.filter((c) => !isExhaustion(c)).map((c) => c.name),
]);

// Only what the character is trained in: eighteen rows of "+0" would bury the three that matter.
const skills = computed(() =>
  SKILLS.filter((s) => (member.skill_proficiencies?.[s.key] ?? "none") !== "none").map((s) => ({
    key: s.key,
    label: s.label,
    bonus: skillCheckBonus(member, s.key, jack.value),
  })),
);
</script>
