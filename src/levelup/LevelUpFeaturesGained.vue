<template>
  <WizardStepCard title="Features Gained">
    <ul v-if="gained.length > 0" class="space-y-1">
      <li v-for="g in gained" :key="g.feature.id" class="space-y-1">
        <AppButton
          variant="menu"
          size="body"
          block
          class="gap-2"
          :disabled="!g.feature.description"
          :aria-expanded="g.feature.description ? expanded.has(g.feature.id) : undefined"
          @click="toggle(g.feature.id)"
        >
          <span class="mt-0.5 shrink-0 text-primary">✦</span>
          <span class="flex-1">
            {{ g.feature.name }}
            <span v-if="g.scalingValue" class="text-muted-foreground">
              ({{ scalingLabel(g) }} {{ g.scalingValue }})
            </span>
          </span>
          <IconChevronDown
            v-if="g.feature.description"
            class="h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform"
            :class="expanded.has(g.feature.id) ? 'rotate-180' : ''"
          />
        </AppButton>
        <div
          v-if="g.feature.description && expanded.has(g.feature.id)"
          class="ml-4 rounded-md border border-border/60 bg-muted/30 px-3 py-2"
        >
          <RichTextViewer :content="g.feature.description" />
        </div>
      </li>
    </ul>
    <p v-else-if="hasClassData" class="text-body italic text-muted-foreground">
      {{ className }} gains no new class features at level {{ classLevel }}.
    </p>
    <p v-else class="text-body italic text-muted-foreground">
      No class-specific feature data available yet for {{ className }}.
    </p>

    <CalloutChip v-for="change in scaling" :key="change.featureId" label="GROWS">
      {{ change.featureName }} ({{ change.label }}):
      <template v-if="change.from !== null">
        <strong class="font-cinzel">{{ change.from }}</strong> →
      </template>
      <strong class="font-cinzel">{{ change.to }}</strong>
    </CalloutChip>

    <CalloutChip v-if="cantripsKnownGain > 0" label="CANTRIPS">
      Cantrips known increases to <strong class="font-cinzel">{{ cantripsKnownTotal }}</strong>.
      Pick {{ cantripsKnownGain }} new cantrip{{ cantripsKnownGain > 1 ? "s" : "" }} below.
    </CalloutChip>

    <CalloutChip v-if="spellsKnownGain > 0" label="SPELLS">
      Spells known increases to <strong class="font-cinzel">{{ spellsKnownTotal }}</strong>.
      Pick {{ spellsKnownGain }} new spell{{ spellsKnownGain > 1 ? "s" : "" }} below.
    </CalloutChip>

    <CalloutChip v-for="pool in pools" :key="pool.key" :label="pool.key.replaceAll('_', ' ').toUpperCase()">
      {{ pool.label }} maximum:
      <template v-if="pool.from !== null">
        <strong class="font-cinzel">{{ pool.from }}</strong> →
      </template>
      <strong class="font-cinzel">{{ pool.to }}</strong>
    </CalloutChip>

    <CalloutChip v-if="profBonusBumped" label="PROF">
      Proficiency bonus increases to <strong class="font-cinzel">+{{ newProfBonus }}</strong>
    </CalloutChip>

    <CalloutChip v-if="spellSlotSummary" label="SLOTS">
      {{ spellSlotSummary }}
    </CalloutChip>
  </WizardStepCard>
</template>

<script setup lang="ts">
import { ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import CalloutChip from "@/components/common/CalloutChip.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import WizardStepCard from "@/components/common/WizardStepCard.vue";
import { IconChevronDown } from "@/lib/icons";
import type { GrantedFeature } from "@/rules/features/characterFeatures";
import type { PoolChange, ScalingChange } from "./levelUpProjection";

const {
  gained,
  scaling,
  pools,
  hasClassData,
  classLevel,
  className,
  cantripsKnownGain,
  cantripsKnownTotal,
  spellsKnownGain,
  spellsKnownTotal,
  profBonusBumped,
  newProfBonus,
  spellSlotSummary,
} = defineProps<{
  /** Class and subclass features gained at the new class level, each once. */
  gained: GrantedFeature[];
  scaling: ScalingChange[];
  pools: PoolChange[];
  hasClassData: boolean;
  classLevel: number;
  className: string;
  cantripsKnownGain: number;
  cantripsKnownTotal: number;
  spellsKnownGain: number;
  spellsKnownTotal: number;
  profBonusBumped: boolean;
  newProfBonus: number;
  spellSlotSummary: string | null;
}>();

const expanded = ref(new Set<string>());

function toggle(id: string) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

function scalingLabel(g: GrantedFeature): string {
  return g.mechanics.scaling === undefined ? "" : g.mechanics.scaling.label;
}
</script>
