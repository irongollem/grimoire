<template>
  <div
    class="mc-row"
    :class="{ 'is-active': active, 'is-dead': dead }"
    :style="{ '--faction-color': factionColor() }"
    role="button"
    tabindex="0"
    :aria-label="`${combatant.name}, open`"
    :data-active="active || undefined"
    @click="emit('open', combatant.instance_id)"
    @keydown.enter.self="emit('open', combatant.instance_id)"
  >
    <div class="mc-init" @click.stop>
      <RunnerInitiativeField v-if="!store.started" :combatant="combatant" />
      <span v-else class="mc-init-num" data-testid="row-init">
        {{ combatant.initiative ?? "—" }}
        <span v-if="tied" class="mc-tie" title="Tied. Higher Dexterity goes first.">tie</span>
      </span>
    </div>

    <div class="mc-portrait">
      <div class="mc-portrait-img" :class="{ 'is-active': active }">
        <FocalImage
          :src="portrait.src"
          :placeholder="placeholder"
          :alt="portrait.alt"
          :focal-point="portrait.focalPoint"
          format="square"
        />
      </div>
      <AppButton
          v-if="combatant.type === 'monster'"
          variant="tinted"
          :tone="revealTone(combatant.reveal_state)"
          :emphasis="combatant.reveal_state === 'hidden' || !combatant.reveal_state ? 'strong' : 'solid'"
          size="icon-xs"
          class="reveal-btn rounded-full"
          :icon="combatant.reveal_state === 'hidden' || !combatant.reveal_state ? IconHide : IconReveal"
          :tooltip="revealBtnTitle(combatant.reveal_state)"
          :aria-label="revealBtnTitle(combatant.reveal_state)"
          @click.stop="handleCycleReveal"
        />
    </div>

    <div class="mc-identity">
      <span class="combatant-name">{{ combatant.name }}</span>
      <p v-if="showDetail" class="mc-detail" data-testid="row-detail">
        <RunnerRollStatus :combatant="combatant" />
        <span v-if="detailText">{{ detailText }}</span>
        <span v-if="reactionSpent" class="mc-reaction" title="Reaction used">⚡</span>
      </p>
    </div>

    <div class="mc-hp">
      <span class="mc-hp-line">
        <span class="mc-hp-num" data-testid="row-hp">{{ displayHp }}/{{ displayMaxHp }}</span>
        <span v-if="displayTempHp" class="mc-temp">+{{ displayTempHp }}</span>
        <span
          v-if="flash"
          :key="flash.id"
          class="damage-flash"
          :class="flash.delta < 0 ? 'is-damage' : 'is-heal'"
          @animationend="flash = undefined"
        >{{ flash.delta > 0 ? "+" : "" }}{{ flash.delta }}</span>
      </span>
      <span class="mc-bar" aria-hidden="true">
        <span class="mc-bar-fill" :class="`is-${tone}`" :style="{ width: `${fraction * 100}%` }" />
      </span>
      <span class="mc-ac">AC {{ displayAc }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IconHide, IconReveal } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import RunnerInitiativeField from "@/components/encounters/RunnerInitiativeField.vue";
import RunnerRollStatus from "@/components/encounters/RunnerRollStatus.vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useRunnerCombatant } from "@/composables/encounters/useRunnerCombatant";
import { useRunnerConditions } from "@/composables/encounters/useRunnerConditions";
import { conditionSummary, hpFraction, hpTone } from "@/lib/encounters/combatantRowSummary";
import type { RunCombatant } from "@/types/encounter.types";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { formPortrait, placeholderKind } from "@/lib/wildshapePortrait";

// Phone row: one line per combatant; everything you can do to it lives in
// RunnerCombatantSheet. The init field and the reveal button act in place and
// stop the click so they do not open the sheet. (No comment in the template:
// it would make a second root and drop the list's data-row-id.)
const { combatant } = defineProps<{ combatant: RunCombatant }>();

const emit = defineEmits<{ open: [id: string] }>();

const store = useEncounterRunStore();

const {
  wildshape,
  displayHp,
  displayMaxHp,
  displayTempHp,
  displayAc,
  factionColor,
  revealTone,
  revealBtnTitle,
  handleCycleReveal,
} = useRunnerCombatant(() => combatant);
const { displayConditions, pcConcentration } = useRunnerConditions(() => combatant);

const active = computed(() => store.started && combatant.instance_id === store.activeCombatant?.instance_id);
const dead = computed(() => combatant.type === "monster" && combatant.hp === 0);
const tied = computed(() => store.tiedInstanceIds.has(combatant.instance_id));
const reactionSpent = computed(() => store.started && combatant.reactionUsed === true);

const portrait = computed(() => formPortrait(combatant, wildshape.value));
const placeholder = computed(() => placeholderUrl(placeholderKind(combatant, portrait.value)));

const fraction = computed(() => hpFraction(displayHp.value, displayMaxHp.value));
const tone = computed(() => hpTone(displayHp.value, displayMaxHp.value));

const concentration = computed(() => pcConcentration.value ?? combatant.concentration?.spellName ?? null);

/** The second line: surprise, wild shape, death, conditions, concentration. */
const detailText = computed(() =>
  [
    combatant.surprised ? "✦ Surprised" : "",
    wildshape.value ? `🐺 ${wildshape.value.beast_name}` : "",
    dead.value ? "☠" : "",
    conditionSummary(displayConditions.value),
    concentration.value ? `✦ ${concentration.value}` : "",
  ]
    .filter((part) => part !== "")
    .join(" · "),
);
// The lobby's roll status renders its own text, so the line needs its box even when ours is empty.
const showDetail = computed(() => detailText.value !== "" || reactionSpent.value || store.round === 0);

// Flash whenever the shown HP moves, whoever moved it: the sheet, a player's own
// sheet arriving over the live sync, or a stepper elsewhere. Not when the
// combatant changes form: going into or out of wild shape swaps which HP pool is
// shown (30/30 to a 13 HP wolf), and nobody was hurt or healed.
const flash = ref<{ delta: number; id: number } | undefined>(undefined);
const inBeastForm = computed(() => !!wildshape.value);
watch([displayHp, inBeastForm], ([now, shaped], [before, wasShaped]) => {
  if (shaped !== wasShaped) return;
  if (now !== before) flash.value = { delta: now - before, id: Date.now() };
});
</script>

<style scoped>
@reference "@/assets/main.css";

.combatant-name {
  @apply text-heading-sm font-semibold text-foreground;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mc-row {
  display: grid;
  grid-template-columns: minmax(2rem, auto) 2.5rem minmax(0, 1fr) 4.75rem;
  align-items: center;
  gap: 0.5rem;
  min-height: 3.5rem;
  padding: 0.375rem 0.75rem 0.375rem 0.875rem;
  border-bottom: 1px solid theme(colors.border / 50%);
  position: relative;
  cursor: pointer;
  transition: background-color 0.15s;
}

.mc-row::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 0.1875rem;
  border-radius: 0 0.125rem 0.125rem 0;
  background-color: var(--faction-color);
}

.mc-row.is-active { @apply bg-primary/10; }
.mc-row.is-active::before { width: 0.375rem; @apply bg-primary; }
.mc-row.is-dead { @apply opacity-40; }

.mc-init { @apply flex items-center justify-center; }
.mc-init-num { @apply text-heading-sm font-bold text-foreground text-center; }
.mc-tie { @apply block text-caption-sm font-normal text-ink-caution; }

.mc-portrait { position: relative; width: 2.5rem; height: 2.5rem; }
.mc-portrait-img { width: 100%; height: 100%; overflow: hidden; display: flex; }
.mc-portrait-img.is-active { box-shadow: 0 0 0 2px theme(colors.primary / 100%); }

/* 1.5rem so a thumb can land on it; it hangs off the portrait's corner. */
.reveal-btn { @apply absolute; right: -0.5rem; bottom: -0.5rem; }

.mc-identity { display: flex; flex-direction: column; min-width: 0; }
.mc-detail {
  @apply text-caption text-muted-foreground;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mc-reaction { @apply ml-1 opacity-40; }

.mc-hp { display: flex; flex-direction: column; align-items: flex-end; gap: 0.125rem; }
.mc-hp-line { position: relative; display: inline-flex; align-items: baseline; gap: 0.25rem; }
.mc-hp-num { @apply text-heading-sm font-bold text-foreground; }
.mc-temp { @apply text-caption font-bold text-ink-info; }
.mc-bar { @apply block w-full overflow-hidden rounded-full bg-muted; height: 0.25rem; }
.mc-bar-fill { @apply block h-full rounded-full; }
.mc-bar-fill.is-success { @apply bg-tone-success; }
.mc-bar-fill.is-caution { @apply bg-tone-caution; }
.mc-bar-fill.is-danger  { @apply bg-destructive; }
.mc-ac { @apply text-caption text-muted-foreground; }

@keyframes damage-flash {
  0%   { opacity: 1; transform: translateX(-50%) translateY(0); }
  70%  { opacity: 1; transform: translateX(-50%) translateY(-0.25rem); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-0.625rem); }
}

.damage-flash {
  position: absolute;
  top: -0.25rem;
  left: 50%;
  font-family: var(--font-cinzel);
  font-size: 1rem;
  font-weight: 800;
  pointer-events: none;
  animation: damage-flash 2.5s ease-in forwards;
  z-index: 10;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  white-space: nowrap;
}
.damage-flash.is-damage { @apply text-destructive; }
.damage-flash.is-heal   { @apply text-ink-success; }
</style>
