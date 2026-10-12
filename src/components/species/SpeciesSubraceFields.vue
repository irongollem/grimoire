<template>
  <div class="space-y-3">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label class="block">
        <span class="block text-label font-semibold text-muted-foreground mb-1">SIZE</span>
        <AppSelect v-model="model.size" size="body">
          <option value="">As species</option>
          <option v-for="sz in SIZES" :key="sz" :value="sz" class="capitalize">{{ sz }}</option>
        </AppSelect>
      </label>
      <div>
        <span class="block text-label font-semibold text-muted-foreground mb-1">LANGUAGES (added to the species')</span>
        <TagInput v-model="model.languages" placeholder="Gnomish…" />
      </div>
    </div>
    <div>
      <span class="block text-label font-semibold text-muted-foreground mb-1">SPEED (ft, replaces the species' value)</span>
      <div class="grid grid-cols-3 sm:grid-cols-5 gap-2">
        <div v-for="type in SPEED_TYPES" :key="type">
          <label class="block text-caption text-muted-foreground mb-0.5 capitalize">{{ type }}</label>
          <AppInput
            :model-value="model.speed[type] ?? null"
            type="number"
            min="0"
            step="5"
            tone="card"
            size="body"
            :placeholder="type === 'walk' ? 'As species' : '—'"
            @update:model-value="setSpeed(type, $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import type { SpeciesSize } from "@/types/species.types";

export const SUBRACE_SPEED_TYPES = ["walk", "fly", "swim", "climb", "burrow"] as const;
export type SubraceSpeedType = (typeof SUBRACE_SPEED_TYPES)[number];

/** The editable shape of a subrace's own size, speed and languages. */
export interface SubraceStatsForm {
  size: SpeciesSize | "";
  speed: Partial<Record<SubraceSpeedType, number>>;
  languages: string[];
}
</script>

<script setup lang="ts">
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import TagInput from "@/components/common/controls/TagInput.vue";

const model = defineModel<SubraceStatsForm>({ required: true });

const SIZES: SpeciesSize[] = ["tiny", "small", "medium", "large"];
const SPEED_TYPES = SUBRACE_SPEED_TYPES;

/** An emptied field deletes the key: an absent mode means "as the species", never a stored null. */
function setSpeed(type: SubraceSpeedType, raw: string | number | null) {
  const value = typeof raw === "number" ? raw : parseInt(String(raw));
  if (raw === null || raw === "" || Number.isNaN(value)) {
    delete model.value.speed[type];
  } else {
    model.value.speed[type] = value;
  }
}
</script>
