<template>
  <div class="rounded-lg border border-border bg-card/50 p-4 flex flex-col gap-3">
    <h3 class="text-label-lg font-bold text-muted-foreground uppercase">
      Weapon
    </h3>
    <div class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">Damage</span>
      <DamageRollsInput :model-value="damageRolls" @update:model-value="emit('update:damageRolls', $event)" />
    </div>
    <div class="grid grid-cols-2 gap-3">
      <label class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground">Versatile Damage</span>
        <DiceExprInput
          :model-value="versatileDamage || null"
          placeholder="e.g. 1d10"
          @update:model-value="emit('update:versatileDamage', $event ?? '')"
        />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground">Range</span>
        <AppInput v-model="weaponRangeModel" tone="filled" size="body" placeholder="e.g. 80/320 ft." />
      </label>
    </div>
    <div class="flex flex-col gap-2">
      <span class="text-eyebrow text-muted-foreground">Properties</span>
      <div class="flex flex-wrap gap-x-4 gap-y-2">
        <label
          v-for="p in WEAPON_PROPERTIES"
          :key="p"
          class="flex items-center gap-1.5 cursor-pointer"
        >
          <input
            type="checkbox"
            :value="p"
            :checked="properties.includes(p)"
            class="rounded"
            @change="toggleProperty(p)"
          />
          <span class="text-body text-foreground capitalize">{{ p }}</span>
        </label>
      </div>
    </div>
    <!-- Mastery — 2024 PHB only; each weapon carries at most one -->
    <div v-if="is2024" class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">Mastery <span class="normal-case font-fell font-normal text-muted-foreground/60">— 2024 only</span></span>
      <AppSelect v-model="masteryModel" tone="filled" weight="normal">
        <option value="">None</option>
        <option v-for="m in WEAPON_MASTERY_PROPERTIES" :key="m" :value="m">{{ WEAPON_MASTERY_DEFINITIONS[m].label }}</option>
      </AppSelect>
      <p v-if="mastery" class="text-caption text-muted-foreground italic">{{ WEAPON_MASTERY_DEFINITIONS[mastery].description }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import DamageRollsInput from "@/components/common/DamageRollsInput.vue";
import DiceExprInput from "@/components/common/DiceExprInput.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { WEAPON_PROPERTIES, WEAPON_MASTERY_PROPERTIES } from "@/types/item.types";
import type { DamageRoll } from "@/lib/dice/dice";
import type { WeaponMasteryProperty } from "@/types/item.types";
import { WEAPON_MASTERY_DEFINITIONS } from "@/data/weaponMastery";
import { useRuleset } from "@/composables/useRuleset";

const {
  damageRolls = [],
  properties = [],
  versatileDamage = "",
  weaponRange = "",
  mastery = null,
} = defineProps<{
  damageRolls?: DamageRoll[];
  properties?: string[];
  versatileDamage?: string;
  weaponRange?: string;
  mastery?: WeaponMasteryProperty | null;
}>();

const emit = defineEmits<{
  "update:damageRolls": [value: DamageRoll[]];
  "update:properties": [value: string[]];
  "update:versatileDamage": [value: string];
  "update:weaponRange": [value: string];
  "update:mastery": [value: WeaponMasteryProperty | null];
}>();

const { is2024 } = useRuleset();

// AppInput/AppSelect require v-model; these bridge the component's existing
// prop-down/emit-up contract (unchanged) onto that, same as a native
// v-model desugars to modelValue/update:modelValue.
const weaponRangeModel = computed({
  get: () => weaponRange,
  set: (v: string) => emit("update:weaponRange", v),
});

const masteryModel = computed({
  get: () => mastery ?? "",
  set: (v: string) => emit("update:mastery", (v || null) as WeaponMasteryProperty | null),
});

function toggleProperty(p: string) {
  const next = properties.includes(p)
    ? properties.filter((x) => x !== p)
    : [...properties, p];
  emit("update:properties", next);
}
</script>
