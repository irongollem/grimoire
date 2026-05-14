<template>
  <WizardStepCard title="Features Gained">
    <template v-if="features.length > 0">
      <ul class="space-y-1">
        <li v-for="feat in features" :key="featureName(feat)" class="space-y-1">
          <button
            class="flex items-start gap-2 font-fell text-sm text-foreground w-full text-left"
            :class="featureDescription(feat) ? 'cursor-pointer' : 'cursor-default'"
            @click="featureDescription(feat) && emit('toggleFeature', featureName(feat))"
          >
            <span class="text-primary mt-0.5 shrink-0">✦</span>
            <span class="flex-1">{{ featureName(feat) }}</span>
            <IconChevronDown
              v-if="featureDescription(feat)"
              class="h-3 w-3 text-muted-foreground/60 mt-0.5 transition-transform shrink-0"
              :class="expandedFeatures.has(featureName(feat)) ? 'rotate-180' : ''"
            />
          </button>
          <div
            v-if="featureDescription(feat) && expandedFeatures.has(featureName(feat))"
            class="ml-4 rounded-md bg-muted/30 border border-border/60 px-3 py-2"
          >
            <RichTextViewer :content="featureDescription(feat)!" />
          </div>
        </li>
      </ul>
    </template>
    <template v-else-if="hasClassData">
      <p class="font-fell text-sm text-muted-foreground italic">
        Class feature details coming soon — check the class description for level {{ nextLevel }} features.
      </p>
    </template>
    <template v-else>
      <p class="font-fell text-sm text-muted-foreground italic">
        No class-specific feature data available yet for {{ className }}.
      </p>
    </template>

    <!-- Cantrips known increase -->
    <CalloutChip v-if="cantripsKnownGain > 0" label="CANTRIPS">
      Cantrips known increases to <strong class="font-cinzel">{{ cantripsKnownTotal }}</strong>
      — pick {{ cantripsKnownGain }} new cantrip{{ cantripsKnownGain > 1 ? 's' : '' }} below.
    </CalloutChip>

    <!-- Spells known increase -->
    <CalloutChip v-if="spellsKnownGain > 0" label="SPELLS">
      Spells known increases to <strong class="font-cinzel">{{ spellsKnownTotal }}</strong>
      — pick {{ spellsKnownGain }} new spell{{ spellsKnownGain > 1 ? 's' : '' }} below.
    </CalloutChip>

    <!-- Class resource updates -->
    <CalloutChip
      v-for="res in resourceNotices"
      :key="res.key"
      :label="res.key.replace('_', ' ').toUpperCase()"
    >
      {{ res.label }} maximum:
      <strong class="font-cinzel">{{ res.oldMax }}</strong> → <strong class="font-cinzel">{{ res.newMax }}</strong>
    </CalloutChip>

    <!-- Proficiency bonus bump -->
    <CalloutChip v-if="profBonusBumped" label="PROF">
      Proficiency bonus increases to <strong class="font-cinzel">+{{ newProfBonus }}</strong>
    </CalloutChip>

    <!-- Spell slot change -->
    <CalloutChip v-if="spellSlotSummary" label="SLOTS">
      {{ spellSlotSummary }}
    </CalloutChip>
  </WizardStepCard>
</template>

<script setup lang="ts">
import WizardStepCard from "@/components/common/WizardStepCard.vue";
import CalloutChip from "@/components/common/CalloutChip.vue";
import { IconChevronDown } from "@/lib/icons";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { featureName, featureDescription } from "./types";
import type { FeatureEntry } from "./types";

const {
  features,
  expandedFeatures,
  hasClassData,
  nextLevel,
  className,
  cantripsKnownGain,
  cantripsKnownTotal,
  spellsKnownGain,
  spellsKnownTotal,
  resourceNotices,
  profBonusBumped,
  newProfBonus,
  spellSlotSummary,
} = defineProps<{
  features: FeatureEntry[];
  expandedFeatures: Set<string>;
  hasClassData: boolean;
  nextLevel: number;
  className: string;
  cantripsKnownGain: number;
  cantripsKnownTotal: number;
  spellsKnownGain: number;
  spellsKnownTotal: number;
  resourceNotices: { key: string; label: string; oldMax: number; newMax: number }[];
  profBonusBumped: boolean;
  newProfBonus: number;
  spellSlotSummary: string | null;
}>();

const emit = defineEmits<{
  toggleFeature: [name: string];
}>();
</script>
