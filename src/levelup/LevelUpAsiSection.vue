<template>
  <WizardStepCard title="Ability Score Improvement or Feat">
    <p class="font-fell text-sm text-muted-foreground">Choose how to apply your improvement.</p>

    <div class="flex rounded-md border border-border overflow-hidden w-fit text-label-lg">
      <button class="px-3 py-1.5 transition-colors"
        :class="asiMode === 'plus2' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
        @click="emit('update:asiMode', 'plus2')">+2 to one</button>
      <button class="px-3 py-1.5 transition-colors"
        :class="asiMode === 'plus1plus1' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
        @click="emit('update:asiMode', 'plus1plus1')">+1 / +1</button>
      <button class="px-3 py-1.5 transition-colors"
        :class="asiMode === 'feat' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
        @click="emit('update:asiMode', 'feat')">Feat</button>
    </div>

    <!-- ASI mode -->
    <template v-if="asiMode !== 'feat'">
      <div class="flex flex-wrap gap-3">
        <div class="space-y-1">
          <label class="text-label text-muted-foreground">
            {{ asiMode === 'plus2' ? '+2 Ability' : '+1 First Ability' }}
          </label>
          <select
            :value="asiPrimary"
            class="rounded border border-border bg-muted/40 px-2 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @change="emit('update:asiPrimary', ($event.target as HTMLSelectElement).value as AbilityKey | '')"
          >
            <option value="" disabled>Select…</option>
            <option v-for="ab in ABILITY_OPTIONS" :key="ab.key" :value="ab.key">{{ ab.label }}</option>
          </select>
        </div>
        <div v-if="asiMode === 'plus1plus1'" class="space-y-1">
          <label class="text-label text-muted-foreground">+1 Second Ability</label>
          <select
            :value="asiSecondary"
            class="rounded border border-border bg-muted/40 px-2 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @change="emit('update:asiSecondary', ($event.target as HTMLSelectElement).value as AbilityKey | '')"
          >
            <option value="" disabled>Select…</option>
            <option v-for="ab in ABILITY_OPTIONS" :key="ab.key" :value="ab.key">{{ ab.label }}</option>
          </select>
        </div>
      </div>
      <div v-if="asiPreview.length > 0" class="font-fell text-sm text-muted-foreground">
        <span v-for="(line, i) in asiPreview" :key="i" class="mr-3">{{ line }}</span>
      </div>
    </template>

    <!-- Feat mode -->
    <template v-else>
      <div class="space-y-2">
        <input
          :value="featSearch"
          type="text"
          placeholder="Search feats…"
          class="w-full rounded border border-border bg-muted/40 px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @input="emit('update:featSearch', ($event.target as HTMLInputElement).value)"
        />
        <div v-if="filteredFeats.length > 0"
          class="max-h-48 overflow-y-auto rounded border border-border divide-y divide-border">
          <button v-for="f in filteredFeats" :key="f.id" type="button"
            class="w-full text-left px-3 py-2 transition-colors"
            :class="featId === f.id ? 'bg-primary/10 text-primary' : 'bg-card text-foreground hover:bg-muted/40'"
            @click="emit('update:featId', featId === f.id ? '' : f.id)">
            <p class="font-cinzel text-xs font-semibold">{{ f.name }}</p>
            <p v-if="f.description" class="font-fell text-[0.6875rem] text-muted-foreground line-clamp-1 mt-0.5">{{ f.description }}</p>
          </button>
        </div>
        <p v-else-if="featSearch" class="font-fell text-sm text-muted-foreground italic">No matching features found.</p>
        <p v-if="featId" class="text-label-lg text-primary">✓ {{ selectedFeatName }}</p>
      </div>
    </template>
  </WizardStepCard>
</template>

<script setup lang="ts">
import WizardStepCard from "@/components/common/WizardStepCard.vue";
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
