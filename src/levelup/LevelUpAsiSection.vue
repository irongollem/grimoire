<template>
  <WizardStepCard title="Ability Score Improvement or Feat">
    <p class="text-body text-muted-foreground">Choose how to apply your improvement.</p>

    <SegmentedControl
      :model-value="asiMode"
      :options="ASI_MODE_OPTIONS"
      @update:model-value="(v) => emit('update:asiMode', v)"
    />

    <!-- ASI mode -->
    <template v-if="asiMode !== 'feat'">
      <div class="flex flex-wrap gap-3">
        <div class="space-y-1">
          <label class="text-label text-muted-foreground">
            {{ asiMode === 'plus2' ? '+2 Ability' : '+1 First Ability' }}
          </label>
          <AppSelect
            :model-value="asiPrimary"
            tone="muted"
            weight="normal"
            @update:model-value="(v) => emit('update:asiPrimary', v)"
          >
            <option value="" disabled>Select…</option>
            <option v-for="ab in ABILITY_OPTIONS" :key="ab.key" :value="ab.key">{{ ab.label }}</option>
          </AppSelect>
        </div>
        <div v-if="asiMode === 'plus1plus1'" class="space-y-1">
          <label class="text-label text-muted-foreground">+1 Second Ability</label>
          <AppSelect
            :model-value="asiSecondary"
            tone="muted"
            weight="normal"
            @update:model-value="(v) => emit('update:asiSecondary', v)"
          >
            <option value="" disabled>Select…</option>
            <option v-for="ab in ABILITY_OPTIONS" :key="ab.key" :value="ab.key">{{ ab.label }}</option>
          </AppSelect>
        </div>
      </div>
      <div v-if="asiPreview.length > 0" class="text-body text-muted-foreground">
        <span v-for="(line, i) in asiPreview" :key="i" class="mr-3">{{ line }}</span>
      </div>
    </template>

    <!-- Feat mode -->
    <template v-else>
      <div class="space-y-2">
        <AppInput
          :model-value="featSearch"
          type="text"
          placeholder="Search feats…"
          tone="muted"
          size="body"
          @update:model-value="(v) => emit('update:featSearch', v)"
        />
        <div v-if="filteredFeats.length > 0"
          class="max-h-48 overflow-y-auto rounded border border-border divide-y divide-border">
          <AppButton
            v-for="f in filteredFeats"
            :key="f.id"
            variant="menu"
            size="body"
            block
            :active="featId === f.id"
            @click="emit('update:featId', featId === f.id ? '' : f.id)"
          >
            <div class="flex flex-col items-start gap-0.5">
              <span class="font-cinzel text-xs font-semibold">{{ f.name }}</span>
              <span v-if="f.description" class="text-caption text-muted-foreground line-clamp-1">{{ f.description }}</span>
            </div>
          </AppButton>
        </div>
        <p v-else-if="featSearch" class="text-body text-muted-foreground italic">No matching features found.</p>
        <p v-if="featId" class="text-label-lg text-primary">✓ {{ selectedFeatName }}</p>
      </div>
    </template>
  </WizardStepCard>
</template>

<script setup lang="ts">
import WizardStepCard from "@/components/common/WizardStepCard.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppButton from "@/components/common/AppButton.vue";
import type { AsiMode, AbilityKey } from "./types";

interface FeatOption {
  id: string;
  name: string;
  description?: string | null;
}

const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: "Strength", dex: "Dexterity", con: "Constitution",
  int: "Intelligence", wis: "Wisdom", cha: "Charisma",
};
const ABILITY_OPTIONS = (Object.entries(ABILITY_LABEL) as [AbilityKey, string][]).map(([key, label]) => ({ key, label }));

const ASI_MODE_OPTIONS: Array<{ value: AsiMode; label: string }> = [
  { value: "plus2", label: "+2 to one" },
  { value: "plus1plus1", label: "+1 / +1" },
  { value: "feat", label: "Feat" },
];

const {
  asiMode,
  asiPrimary,
  asiSecondary,
  asiPreview,
  featSearch,
  featId,
  filteredFeats,
  selectedFeatName,
} = defineProps<{
  asiMode: AsiMode;
  asiPrimary: AbilityKey | "";
  asiSecondary: AbilityKey | "";
  asiPreview: string[];
  featSearch: string;
  featId: string;
  filteredFeats: FeatOption[];
  selectedFeatName: string;
}>();

const emit = defineEmits<{
  "update:asiMode": [value: AsiMode];
  "update:asiPrimary": [value: AbilityKey | ""];
  "update:asiSecondary": [value: AbilityKey | ""];
  "update:featSearch": [value: string];
  "update:featId": [value: string];
}>();
</script>
