<template>
  <MobileSheet v-model:open="open" :title="combatant.name">
    <div class="flex flex-col gap-4 pb-2">
      <div class="flex items-center gap-3">
        <div class="h-12 w-12 shrink-0 overflow-hidden">
          <FocalImage
            :src="portrait.src"
            :placeholder="placeholder"
            :alt="portrait.alt"
            :focal-point="portrait.focalPoint"
            format="square"
          />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-heading font-bold text-foreground" data-testid="sheet-hp">
            HP {{ displayHp }} / {{ displayMaxHp }}
            <span v-if="displayTempHp" class="text-label text-ink-info">+{{ displayTempHp }} temp</span>
          </p>
          <p class="text-caption text-muted-foreground">AC {{ displayAc }}</p>
        </div>
        <label class="flex flex-col items-center gap-0.5 text-caption text-muted-foreground">
          Init
          <RunnerInitiativeField :combatant="combatant" />
        </label>
      </div>

      <section class="flex flex-col gap-2" aria-label="Hit points">
        <div class="flex items-end gap-2">
          <AppButton variant="outline" size="lg" :icon="IconMinus" aria-label="Lose 1 HP" @click="handleAdjustHp(-1)" />
          <AppInput
            v-model.lazy="hpFieldModel"
            type="number"
            min="0"
            :max="displayMaxHp"
            inputmode="numeric"
            tone="filled"
            size="lg"
            align="center"
            :block="false"
            class="w-20 font-bold"
            aria-label="Current HP"
          />
          <AppButton variant="outline" size="lg" :icon="IconAdd" aria-label="Gain 1 HP" @click="handleAdjustHp(1)" />
          <label class="ml-auto flex flex-col items-center gap-0.5 text-caption text-muted-foreground">
            Max HP
            <AppInput
              v-model.lazy="maxHpFieldModel"
              type="number"
              min="1"
              inputmode="numeric"
              tone="filled"
              size="sm"
              align="center"
              :block="false"
              class="w-16"
            />
          </label>
        </div>

        <AppInput
          v-model.number="quickAmount"
          type="number"
          min="0"
          inputmode="numeric"
          tone="filled"
          size="lg"
          align="center"
          placeholder="Amount"
          aria-label="Amount"
          @keydown.enter="damage"
        />
        <AppCheckbox v-if="canCrit" v-model="quickCritical" size="sm" label="Critical hit" label-role="caption" />
        <div class="grid grid-cols-3 gap-2">
          <AppButton variant="tinted" tone="danger" emphasis="outline" size="lg" block label="Damage" @click="damage" />
          <AppButton variant="tinted" tone="success" emphasis="outline" size="lg" block label="Heal" @click="heal" />
          <AppButton variant="tinted" tone="info" emphasis="outline" size="lg" block label="+Temp" @click="temp" />
        </div>
      </section>

      <section class="flex flex-wrap items-center gap-1.5" aria-label="Conditions">
        <RunnerConditionBadges :combatant="combatant" />
      </section>

      <section v-if="canSetSurprise || combatant.type === 'monster'" class="flex flex-col gap-2">
        <AppButton
          v-if="canSetSurprise"
          variant="outline"
          size="md"
          block
          :active="combatant.surprised === true"
          :label="combatant.surprised ? '✦ Surprised (tap to clear)' : 'Mark as surprised'"
          @click="store.toggleSurprised(combatant.instance_id)"
        />
        <AppButton
          v-if="combatant.type === 'monster'"
          variant="outline"
          size="md"
          block
          :icon="combatant.reveal_state === 'hidden' || !combatant.reveal_state ? IconHide : IconReveal"
          :label="revealLabel"
          @click="handleCycleReveal"
        />
      </section>
    </div>

    <template #footer>
      <AppButton variant="primary" size="lg" block label="Stat block & actions" @click="openDetail" />
    </template>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconAdd, IconHide, IconMinus, IconReveal } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import MobileSheet from "@/components/common/overlays/MobileSheet.vue";
import RunnerConditionBadges from "@/components/encounters/RunnerConditionBadges.vue";
import RunnerInitiativeField from "@/components/encounters/RunnerInitiativeField.vue";
import { useRunnerCombatant } from "@/composables/encounters/useRunnerCombatant";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { formPortrait } from "@/lib/wildshapePortrait";
import type { RevealState, RunCombatant } from "@/types/encounter.types";

const open = defineModel<boolean>("open", { required: true });
const { combatant } = defineProps<{ combatant: RunCombatant }>();
const emit = defineEmits<{ "open-detail": [id: string] }>();

const store = useEncounterRunStore();

const {
  wildshape,
  displayHp,
  displayMaxHp,
  displayTempHp,
  displayAc,
  handleAdjustHp,
  handleSetHp,
  handleSetMaxHp,
  quickAmount,
  quickCritical,
  canCrit,
  quickDamage,
  quickHeal,
  quickTemp,
  handleCycleReveal,
} = useRunnerCombatant(() => combatant);

const portrait = computed(() => formPortrait(combatant, wildshape.value));
const placeholder = computed(() => {
  if (portrait.value.shaped) return placeholderUrl("monster");
  if (combatant.type === "player") return placeholderUrl("character");
  return combatant.npc_id ? placeholderUrl("npc") : placeholderUrl("monster");
});

// Surprise is decided at the top of the fight: the lobby and round 1.
const canSetSurprise = computed(() => !store.started || store.round === 1);

const REVEAL_LABEL: Record<RevealState, string> = {
  hidden: "Hidden from players",
  unseen: "Unseen",
  revealed: "Revealed",
};
const revealLabel = computed(() => REVEAL_LABEL[combatant.reveal_state ?? "hidden"]);

// `.lazy` commits on blur/Enter, so a half-typed "4" never lands as 4 HP.
const hpFieldModel = computed<string | number>({
  get: () => displayHp.value,
  set: (raw) => handleSetHp(raw),
});
const maxHpFieldModel = computed<string | number>({
  get: () => displayMaxHp.value,
  set: (raw) => handleSetMaxHp(Number(raw)),
});

// The row's flash is the feedback, so a successful hit closes the sheet. An
// empty amount does nothing, and must not close it on a stray tap.
async function damage() {
  if (!quickAmount.value) return;
  await quickDamage();
  open.value = false;
}
function heal() {
  if (!quickAmount.value) return;
  quickHeal();
  open.value = false;
}
function temp() {
  if (!quickAmount.value) return;
  quickTemp();
  open.value = false;
}

function openDetail() {
  emit("open-detail", combatant.instance_id);
  open.value = false;
}
</script>
