<template>
  <div
    class="flex gap-3 rounded-lg border border-border bg-card/60 p-2.5 transition-opacity"
    :class="{ 'opacity-70': fights && !companion.combat_ready }"
  >
    <!-- The portrait runs the card's full height, as a hero's does in the row
         above it: a token beside the name left the art too small to see
         (maintainer, 16 Nov 2026). -->
    <div
      v-if="!lowArt"
      data-testid="companion-portrait"
      class="card-plate shrink-0 self-stretch w-24 sm:w-28 min-h-28 rounded-md overflow-hidden bg-muted"
    >
      <FocalImage
        :src="companion.portrait_url"
        :alt="companion.name"
        format="portrait"
        :focal-point="companion.portrait_focal_point ?? null"
        :placeholder="placeholderUrl('companion')"
        record
      />
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-2">
    <!-- Header row -->
    <div class="flex items-center gap-2">
      <!-- Type indicator -->
      <span
        class="shrink-0 h-2 w-2 rounded-full"
        :style="{ backgroundColor: COMPANION_TYPE_COLORS[companion.companion_type] }"
        :title="COMPANION_TYPE_LABELS[companion.companion_type]"
      />

      <!-- Name + type badge -->
      <div class="min-w-0 flex-1">
        <p class="text-heading-xs font-semibold text-foreground truncate leading-tight">
          {{ companion.name || "Unnamed" }}
        </p>
        <p class="text-caption-sm text-muted-foreground italic leading-tight">
          {{ COMPANION_TYPE_LABELS[companion.companion_type] }}
          <template v-if="sourceName">
            · <RouterLink :to="sourceLink ?? '#'" class="hover:text-primary transition-colors">{{ sourceName }}</RouterLink>
          </template>
          <!-- Subtle benched indicator — the toggle chip below is the primary control -->
          <span v-if="fights && !companion.combat_ready" class="text-ink-caution">· Elsewhere</span>
        </p>
      </div>

      <!-- HP -->
      <div class="text-right shrink-0">
        <span class="text-heading-sm font-bold" :class="hpTextColor">{{ companion.current_hp }}</span>
        <span class="text-caption text-muted-foreground">/{{ companion.max_hp }}</span>
      </div>

      <!-- Edit / delete -->
      <div class="flex items-center gap-1 shrink-0">
        <AppButton
          variant="ghost"
          size="icon-xs"
          icon-size="xs"
          :icon="IconEdit"
          tooltip="Edit companion"
          @click="$emit('edit', companion)"
        />
        <AppButton
          variant="ghost"
          tone="danger"
          size="icon-xs"
          icon-size="xs"
          :icon="IconClose"
          tooltip="Remove companion"
          @click="$emit('delete', companion)"
        />
      </div>
    </div>

    <!-- HP bar -->
    <div class="h-1 w-full rounded-full bg-muted overflow-hidden">
      <div
        class="h-full rounded-full transition-all"
        :class="hpBarColor"
        :style="{ width: `${hpPct}%` }"
      />
    </div>

    <!-- Key stats: the same grid as the hero's row, passives included, since
         a pet's Perception matters at the table as much as its owner's. -->
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5 text-label-lg">
      <span v-for="stat in keyStats" :key="stat.label" class="flex items-baseline justify-between gap-1 min-w-0">
        <span class="text-muted-foreground truncate">{{ stat.label }}</span>
        <span class="font-bold text-foreground shrink-0">{{ stat.value }}</span>
      </span>
    </div>

    <!-- Combat toggle + HP controls -->
    <div class="flex items-center gap-2 flex-wrap">
      <!-- Combat-ready toggle: whether this companion auto-joins new encounters (#569).
           Off state is `chip` (filled, muted) rather than `subtle`, which is what it
           looked like before; `chip` draws no border, so the explicit one below keeps
           the button from shifting a pixel as it flips. -->
      <AppButton
        v-if="fights"
        :variant="companion.combat_ready ? 'tinted' : 'chip'"
        size="xs"
        role="switch"
        :aria-checked="companion.combat_ready"
        tone="success"
        emphasis="soft"
        :label="companion.combat_ready ? 'With Party' : 'Elsewhere'"
        :tooltip="companion.combat_ready
          ? 'With the party · joins new encounters. Click to bench.'
          : 'Elsewhere · sits out new encounters. Click to bring back.'"
        class="border border-border"
        @click="toggleCombatReady"
      />

      <!-- Damage -->
      <div class="flex items-center gap-1 ml-auto">
        <AppInput
          v-model.number="hpAmount"
          type="number"
          min="1"
          placeholder="HP"
          tone="filled"
          size="caption"
          align="center"
          :block="false"
          class="w-12"
        />
        <AppButton
          variant="tinted"
          size="xs"
          label="DMG"
          tooltip="Deal damage"
          tone="danger"
          emphasis="soft"
          @click="damage"
        />
        <AppButton
          variant="tinted"
          size="xs"
          label="HEAL"
          tooltip="Heal"
          tone="success"
          emphasis="soft"
          @click="heal"
        />
      </div>
    </div>

    <!-- Conditions -->
    <div v-if="companion.conditions.length" class="flex flex-wrap gap-1">
      <ExhaustionChip
        v-if="getExhaustionLevel(companion.conditions) > 0"
        :level="getExhaustionLevel(companion.conditions)"
        @update="setExhaustion"
      />
      <span
        v-for="cond in companion.conditions.filter((c) => !isExhaustion(c))"
        :key="cond.name"
        class="flex items-center gap-1 px-1.5 py-0.5 rounded bg-destructive/10 border border-destructive/20 text-label text-destructive"
        :title="getConditionDescription(cond.name, ruleset)"
      >
        {{ cond.name }}
        <button type="button" class="leading-none hover:opacity-70" @click="removeCondition(cond.name)">×</button>
      </span>
      <AppButton
        v-if="!addingCondition"
        variant="subtle"
        size="xs"
        label="+ Condition"
        class="border-dashed hover:border-border/80"
        @click="addingCondition = true"
      />
    </div>

    <!-- Add condition inline input -->
    <div v-if="addingCondition" class="flex items-center gap-1">
      <AppSelect
        v-model="newCondition"
        size="caption"
        weight="normal"
        class="flex-1"
      >
        <option value="">Pick condition…</option>
        <option v-for="c in availableConditions" :key="c" :value="c">{{ c }}</option>
      </AppSelect>
      <AppButton variant="link" size="sm" label="Add" @click="addCondition" />
      <AppButton variant="ghost" size="sm" label="✕" @click="addingCondition = false; newCondition = ''" />
    </div>

    <!-- Add condition button when no conditions yet -->
    <div v-else-if="!companion.conditions.length">
      <AppButton
        variant="subtle"
        size="xs"
        label="+ Condition"
        class="border-dashed hover:border-border/80"
        @click="addingCondition = true"
      />
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconClose, IconEdit } from '@/lib/icons';
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { useUpdateCompanion } from "@/composables/encounters/useCompanions";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import {
  CONDITIONS,
  getConditionDescription,
  getExhaustionLevel,
  setExhaustionLevel,
  isExhaustion,
  hasCondition,
  withCondition,
  withoutCondition,
} from "@/rules/conditions";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import ExhaustionChip from "@/components/common/statblock/ExhaustionChip.vue";
import {
  COMPANION_TYPE_LABELS,
  COMPANION_TYPE_COLORS,
} from "@/types/companion.types";
import type { Companion } from "@/types/companion.types";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { useLowArt } from "@/composables/useLowArt";
import { takesPartInCombat } from "@/lib/encounters/companionCombat";
import { statBlockPassive } from "@/rules/skillCheck";

const props = defineProps<{
  companion: Companion;
  sourceName?: string;
  sourceLink?: string;
}>();

defineEmits<{
  edit: [companion: Companion];
  delete: [companion: Companion];
}>();

// A pet has no "with the party / elsewhere" state: it never fights (#1115).
const { lowArt } = useLowArt();
const fights = computed(() => takesPartInCombat(props.companion));

// A companion without a stat block has no ability scores to score a passive
// from, so it shows only what its own columns hold.
const keyStats = computed(() => {
  const c = props.companion;
  const stats = [
    { label: "AC", value: String(c.ac) },
    { label: "Speed", value: `${c.speed} ft` },
  ];
  const block = c.stat_block;
  if (!block) return stats;
  return [
    ...stats,
    { label: "Perception", value: String(statBlockPassive(block, "perception")) },
    { label: "Insight", value: String(statBlockPassive(block, "insight")) },
    { label: "Investigation", value: String(statBlockPassive(block, "investigation")) },
  ];
});

const { mutateAsync: updateCompanion } = useUpdateCompanion();
const { ruleset } = useTableRuleset();

const hpAmount = ref(1);
const addingCondition = ref(false);
const newCondition = ref("");

const hpPct = computed(() =>
  props.companion.max_hp > 0
    ? Math.max(0, Math.min(100, (props.companion.current_hp / props.companion.max_hp) * 100))
    : 0,
);

const hpTextColor = computed(() => {
  const pct = hpPct.value / 100;
  if (pct <= 0)    return "text-muted-foreground";
  if (pct <= 0.25) return "text-destructive";
  if (pct <= 0.5)  return "text-ink-caution";
  return "text-ink-success";
});

const hpBarColor = computed(() => {
  const pct = hpPct.value / 100;
  if (pct <= 0)    return "bg-muted-foreground/40";
  if (pct <= 0.25) return "bg-tone-danger";
  if (pct <= 0.5)  return "bg-tone-caution";
  return "bg-tone-success";
});

const availableConditions = computed(() => {
  const hasExhaustion = getExhaustionLevel(props.companion.conditions) > 0;
  return CONDITIONS.filter((c) => {
    if (c === "Exhaustion") return !hasExhaustion;
    return !hasCondition(props.companion.conditions, c);
  });
});

async function damage() {
  const amount = hpAmount.value;
  if (!amount || amount < 1) return;
  const newHp = Math.max(0, props.companion.current_hp - amount);
  await updateCompanion({ id: props.companion.id, update: { current_hp: newHp } });
  hpAmount.value = 1;
}

async function heal() {
  const amount = hpAmount.value;
  if (!amount || amount < 1) return;
  const newHp = Math.min(props.companion.max_hp, props.companion.current_hp + amount);
  await updateCompanion({ id: props.companion.id, update: { current_hp: newHp } });
  hpAmount.value = 1;
}

async function toggleCombatReady() {
  await updateCompanion({ id: props.companion.id, update: { combat_ready: !props.companion.combat_ready } });
}

async function addCondition() {
  if (!newCondition.value) return;
  if (newCondition.value === "Exhaustion") {
    await setExhaustion(1);
  } else {
    const updated = withCondition(props.companion.conditions, { name: newCondition.value });
    await updateCompanion({ id: props.companion.id, update: { conditions: updated } });
  }
  newCondition.value = "";
  addingCondition.value = false;
}

async function removeCondition(cond: string) {
  const updated = withoutCondition(props.companion.conditions, cond);
  await updateCompanion({ id: props.companion.id, update: { conditions: updated } });
}

async function setExhaustion(level: number) {
  const updated = setExhaustionLevel(props.companion.conditions, level);
  await updateCompanion({ id: props.companion.id, update: { conditions: updated } });
}
</script>
