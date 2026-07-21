<template>
  <div class="space-y-4">
    <p class="text-body text-muted-foreground italic">
      Choose your starting loadout. Items linked to your vault are added with full stats; unrecognised names are added as
      text entries you can link later.
    </p>

    <!-- Class equipment choice -->
    <div v-if="classEquipmentPack" class="space-y-3">
      <p class="text-label-lg font-semibold text-muted-foreground">
        {{ f.class?.toUpperCase() }} STARTING EQUIPMENT
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          v-for="key in (['a', 'b'] as const)" :key="key" type="button"
          class="rounded-lg border text-left transition-all p-3 space-y-2"
          :class="classEquipmentChoice === key
            ? 'border-primary ring-1 ring-primary bg-primary/5'
            : 'border-border bg-card hover:border-primary/40'"
          @click="classEquipmentChoice = key">
          <p class="font-cinzel text-xs font-semibold text-foreground">
            {{ key === 'a' ? 'Choice A' : 'Choice B' }}
            <span class="font-fell font-normal text-muted-foreground ml-1">— {{ classEquipmentPack[key].label }}</span>
          </p>
          <ul class="space-y-0.5">
            <li
              v-for="item in classEquipmentPack[key].items" :key="item.name + (item.quantity ?? 1)"
              class="text-caption text-foreground flex items-center gap-1.5">
              <span class="text-primary/60 shrink-0">·</span>
              <span v-if="(item.quantity ?? 1) > 1" class="text-muted-foreground">{{ item.quantity }}×</span>
              {{ item.name }}
            </li>
          </ul>
        </button>
      </div>
      <label class="flex items-start gap-2 cursor-pointer">
        <input type="checkbox" v-model="importClassEquipment" class="mt-0.5 h-4 w-4 rounded border-border bg-muted" />
        <span class="text-caption text-muted-foreground">Add selected loadout to my inventory automatically.</span>
      </label>
    </div>

    <div v-else class="rounded-lg border border-border bg-card p-3">
      <p class="text-body text-muted-foreground italic">
        No standard equipment defined for {{ f.class || 'this class' }}.
        <span v-if="!f.class"> Pick a class first.</span>
      </p>
    </div>

    <!-- Background equipment summary -->
    <div v-if="selectedBg?.equipment" class="rounded-lg border border-border bg-card p-3 space-y-2">
      <p class="text-label-lg font-semibold text-muted-foreground">BACKGROUND EQUIPMENT</p>
      <p class="text-body text-foreground whitespace-pre-wrap">{{ selectedBg.equipment }}</p>
      <label class="flex items-start gap-2 cursor-pointer pt-0.5">
        <input type="checkbox" v-model="importBackgroundEquipment" class="mt-0.5 h-4 w-4 rounded border-border bg-muted" />
        <span class="text-caption text-muted-foreground">Add background equipment to inventory automatically.</span>
      </label>
    </div>

    <div v-if="!classEquipmentPack && !selectedBg?.equipment"
      class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
      <span class="text-amber-500 shrink-0 mt-0.5">⚡</span>
      <p class="text-body text-amber-700 dark:text-amber-400">
        No starting equipment — pick a class and background first, or continue and add gear manually.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CharacterCreationForm } from "@/composables/useCharacterCreationForm";

const { form } = defineProps<{ form: CharacterCreationForm }>();

const {
  f,
  classEquipmentPack,
  classEquipmentChoice,
  importClassEquipment,
  selectedBg,
  importBackgroundEquipment,
} = form;
</script>
