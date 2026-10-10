<template>
  <ExhaustionChip
    v-if="getExhaustionLevel(displayConditions) > 0"
    variant="amber"
    :level="getExhaustionLevel(displayConditions)"
    @update="onExhaustionChange"
  />

  <span v-for="cond in nonExhaustion" :key="cond.name" class="cond-group">
    <AppButton
      variant="tinted"
      tone="caution"
      size="xs"
      class="cond-body"
      :tooltip="badgeTitle(cond)"
      :aria-label="`Edit ${cond.name}`"
      @click.stop="openEditor(cond.name, $event)"
    >
      <span class="cond-text">
        <span>{{ cond.name }}</span>
        <span v-if="subline(cond)" class="cond-sub">{{ subline(cond) }}</span>
      </span>
    </AppButton>
    <AppButton
      variant="tinted"
      tone="caution"
      size="icon-xs"
      class="cond-x"
      :icon="IconClose"
      :aria-label="`Remove ${cond.name}`"
      :tooltip="`Remove ${cond.name}`"
      @click.stop="removeByName(cond.name)"
    />
  </span>

  <AppButton
    v-if="pcConcentration"
    variant="tinted"
    tone="arcane"
    size="xs"
    :tooltip="`Concentrating on ${pcConcentration}. Drop it`"
    @click.stop="dropConcentration()"
  >✦ {{ pcConcentration }} ×</AppButton>
  <AppButton
    v-for="spell in heldSpells"
    :key="spell"
    variant="tinted"
    tone="arcane"
    size="xs"
    :tooltip="`Concentrating on ${spell}. Drop it and end what it holds`"
    @click.stop="dropConcentration(spell)"
  >✦ {{ spell }} ×</AppButton>

  <AppButton
    v-if="store.started"
    variant="tinted"
    :tone="combatant.reactionUsed ? 'neutral' : 'info'"
    size="icon-xs"
    :icon="IconLightning"
    :class="{ 'reaction-used': combatant.reactionUsed }"
    :aria-label="combatant.reactionUsed ? 'Reaction used. Restore it' : 'Reaction available. Mark it used'"
    :tooltip="combatant.reactionUsed ? 'Reaction used. Restore it' : 'Reaction available. Mark it used'"
    @click.stop="store.toggleReaction(combatant.instance_id)"
  />

  <ConditionPicker :conditions="displayConditions" @pick="onConditionPickerPick" @custom="openNewEditor" />

  <ConditionEditor
    :open="editor !== null"
    :anchor="editor?.anchor ?? null"
    :condition="editing"
    :others="others"
    :concentration-of="concentrationOf"
    @save="onSave"
    @remove="onRemove"
    @close="editor = null"
  />
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconClose, IconLightning } from "@/lib/icons";
import ExhaustionChip from "@/components/common/statblock/ExhaustionChip.vue";
import ConditionEditor from "@/components/encounters/ConditionEditor.vue";
import ConditionPicker from "@/components/encounters/ConditionPicker.vue";
import { useRunnerConditions } from "@/composables/encounters/useRunnerConditions";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { describeConditionEnd, describeConditionSource, describeOngoing } from "@/rules/conditionLabels";
import { findCondition, getConditionDescription, getExhaustionLevel } from "@/rules/conditions";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { AppliedCondition } from "@/types/condition.types";
import type { RunCombatant } from "@/types/encounter.types";

/**
 * The conditions strip of a runner row or card (#1018): exhaustion, one badge
 * per condition (name, what ends it, a mark when a roll is owed), concentration
 * chips, the reaction chip (once combat has started), the picker and the editor.
 * Renders as a fragment so the
 * caller's flex row lays the badges out.
 */
const { combatant } = defineProps<{ combatant: RunCombatant }>();

const store = useEncounterRunStore();
const { ruleset } = useTableRuleset();
const {
  displayConditions,
  nonExhaustion,
  nameOf,
  pcConcentration,
  concentrationOf,
  heldSpells,
  onExhaustionChange,
  applyRecord,
  removeByName,
  onConditionPickerPick,
  dropConcentration,
} = useRunnerConditions(() => combatant);

/** The condition being edited (by name), or a new one (name null), and what the popover hangs from. */
const editor = ref<{ name: string | null; anchor: Element | null } | null>(null);
const editing = computed(() => (editor.value?.name ? (findCondition(displayConditions.value, editor.value.name) ?? null) : null));

const others = computed(() =>
  store.sortedCombatants.filter((c) => c.instance_id !== combatant.instance_id).map((c) => ({ id: c.instance_id, name: c.name })),
);

function openEditor(name: string, event: MouseEvent) {
  editor.value = { name, anchor: event.currentTarget instanceof Element ? event.currentTarget : null };
}

function openNewEditor(anchor: Element | null) {
  editor.value = { name: null, anchor };
}

async function onSave(record: AppliedCondition) {
  editor.value = null;
  await applyRecord(record);
}

function onRemove(name: string) {
  editor.value = null;
  removeByName(name);
}

/** The muted second line: what ends it, and which roll is owed. */
function subline(cond: AppliedCondition): string | null {
  const parts: string[] = [];
  const end = describeConditionEnd(cond, nameOf.value);
  if (end) parts.push(end);
  if (cond.due?.save) parts.push("save due");
  if (cond.due?.damage) parts.push("damage due");
  return parts.length > 0 ? parts.join(" · ") : null;
}

function badgeTitle(cond: AppliedCondition): string {
  const lines = [getConditionDescription(cond.name, ruleset.value)];
  const source = describeConditionSource(cond, nameOf.value);
  if (source) lines.push(`From ${source}`);
  if (cond.ongoing) lines.push(describeOngoing(cond.ongoing));
  return lines.join("\n\n");
}
</script>

<style scoped>
@reference "@/assets/main.css";

.cond-group {
  display: inline-flex;
  align-items: stretch;
  max-width: 100%;
}

/* A split chip: the body opens the editor, the × removes. */
.cond-group :deep(.cond-body) {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border-right-width: 0;
  min-width: 0;
  text-align: left;
}
/* Icon-sized, so Vellum draws no tone mark on it, and as tall as the body beside it. */
.cond-group :deep(.cond-x) {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  height: auto;
}

.cond-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  line-height: 1.15;
}

.cond-sub {
  @apply text-caption-sm font-normal text-muted-foreground;
  max-width: 11rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reaction-used {
  opacity: 0.45;
}
</style>
