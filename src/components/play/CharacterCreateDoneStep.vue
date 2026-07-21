<template>
  <div class="space-y-4">
    <p class="text-body text-muted-foreground italic">
      {{ isEditMode
        ? 'Review your changes before saving.'
        : 'All set! Stats are derived from your choices — no magic numbers.' }}
    </p>

    <!-- Summary card -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">

      <!-- Header -->
      <div class="px-4 py-3 border-b border-border bg-muted/20 flex items-center gap-3">
        <div v-if="portraitUrl" class="w-10 h-10 rounded-full overflow-hidden shrink-0">
          <FocalImage :src="portraitUrl" :alt="f.name" format="portrait" :focal-point="focalPoint" />
        </div>
        <div>
          <p class="font-cinzel text-base font-bold text-foreground">{{ f.name || '—' }}</p>
          <p class="text-caption text-muted-foreground">
            Level {{ isEditMode ? f.level : 1 }}
            {{ [selectedSpecies?.name, f.class].filter(Boolean).join(' ') }}
            {{ f.subrace ? `(${f.subrace})` : '' }}
          </p>
        </div>
      </div>

      <!-- Ability scores -->
      <div class="px-4 pt-3 pb-2 grid grid-cols-6 gap-2">
        <div v-for="stat in ABILITY_STATS" :key="stat.key" class="text-center">
          <p class="text-label text-muted-foreground">{{ stat.label }}</p>
          <p class="font-cinzel text-sm font-bold">{{ displayScore(stat.key) }}</p>
          <p class="font-cinzel text-2xs"
            :class="totalMod(stat.key) >= 0 ? 'text-green-500' : 'text-destructive'">
            {{ totalMod(stat.key) >= 0 ? '+' : '' }}{{ totalMod(stat.key) }}
          </p>
        </div>
      </div>

      <!-- Derived combat stats (new chars only) -->
      <div v-if="!isEditMode" class="px-4 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="rounded-md bg-muted/40 p-2 text-center">
          <p class="text-label text-muted-foreground">MAX HP</p>
          <p class="font-cinzel text-lg font-bold text-foreground">{{ derivedHp ?? '—' }}</p>
          <p v-if="selectedClass" class="font-cinzel text-2xs text-muted-foreground">d{{ selectedClass.hit_die }} + CON</p>
          <p v-else class="font-cinzel text-2xs text-muted-foreground">pick a class</p>
        </div>
        <div class="rounded-md bg-muted/40 p-2 text-center">
          <p class="text-label text-muted-foreground">ARMOR CLASS</p>
          <p class="font-cinzel text-lg font-bold text-foreground">{{ derivedAc }}</p>
          <p class="font-cinzel text-2xs text-muted-foreground">10 + DEX</p>
        </div>
        <div class="rounded-md bg-muted/40 p-2 text-center">
          <p class="text-label text-muted-foreground">SPEED</p>
          <p class="font-cinzel text-lg font-bold text-foreground">{{ derivedSpeed }} ft</p>
          <p class="font-cinzel text-2xs text-muted-foreground">{{ selectedSpecies?.name ?? 'base' }}</p>
        </div>
        <div class="rounded-md bg-muted/40 p-2 text-center">
          <p class="text-label text-muted-foreground">INITIATIVE</p>
          <p class="font-cinzel text-lg font-bold text-foreground">
            {{ derivedInitiative >= 0 ? '+' : '' }}{{ derivedInitiative }}
          </p>
          <p class="font-cinzel text-2xs text-muted-foreground">DEX mod</p>
        </div>
      </div>

      <!-- Choices summary row -->
      <div v-if="selectedBg || f.alignment" class="px-4 pb-3 flex flex-wrap gap-x-4 gap-y-1">
        <div v-if="selectedBg" class="flex items-center gap-1">
          <span class="text-label text-muted-foreground">BG</span>
          <span class="text-caption text-foreground">{{ selectedBg.name }}</span>
        </div>
        <div v-if="f.alignment" class="flex items-center gap-1">
          <span class="text-label text-muted-foreground">ALIGN</span>
          <span class="text-caption text-foreground">{{ f.alignment }}</span>
        </div>
      </div>

      <!-- Spell slots (if class is a caster) -->
      <div v-if="spellSlotMaxes.some(v => v > 0)" class="px-4 pb-3">
        <p class="text-label text-muted-foreground mb-1.5">SPELL SLOTS</p>
        <div class="flex flex-wrap gap-1.5">
          <span v-for="(max, idx) in spellSlotMaxes" v-show="max > 0" :key="idx"
            class="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 font-cinzel text-2xs text-primary">
            {{ SLOT_LEVEL_LABELS[idx] }}: {{ max }}
          </span>
        </div>
      </div>
    </div>

    <!-- Warning: no class selected -->
    <div v-if="!f.class" class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
      <span class="text-amber-500 shrink-0 mt-0.5">⚡</span>
      <p class="text-body text-amber-700 dark:text-amber-400">
        No class selected — HP will default to 8. You can set your class later via the Edit screen.
      </p>
    </div>

    <!-- Save actions -->
    <div v-if="!isEditMode" class="flex flex-col sm:flex-row items-stretch gap-3">
      <button type="button"
        :disabled="!f.name.trim() || saving"
        class="flex-1 px-4 py-3 font-cinzel text-sm font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save(false)">
        {{ saving ? 'Creating…' : 'Begin My Adventure' }}
      </button>
      <button type="button"
        :disabled="!f.name.trim() || saving"
        class="flex-1 px-4 py-3 font-cinzel text-sm font-semibold border border-primary text-primary rounded-md hover:bg-primary/5 transition-colors disabled:opacity-50"
        @click="save(true)">
        Begin + Level Up to 2
      </button>
    </div>
    <div v-else>
      <button type="button"
        :disabled="!f.name.trim() || saving"
        class="w-full px-4 py-3 font-cinzel text-sm font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save(false)">
        {{ saving ? 'Saving…' : 'Save Character' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import FocalImage from "@/components/common/FocalImage.vue";
import { ABILITY_STATS, SLOT_LEVEL_LABELS } from "@/composables/useCharacterCreationForm";
import type { CharacterCreationForm, AbilityKey } from "@/composables/useCharacterCreationForm";

const { form } = defineProps<{ form: CharacterCreationForm }>();

const {
  f, isEditMode, saving,
  portraitUrl, focalPoint, spellSlotMaxes,
  selectedSpecies, selectedBg, selectedClass,
  selectedSubrace, asiMode,
  derivedHp, derivedAc, derivedSpeed, derivedInitiative,
  mod, save,
} = form;

// Reuse the same ASI logic to compute displayed scores on the summary card.
function isStructuredAsi(asi: Record<string, number | string> | null | undefined): boolean {
  if (!asi) return true;
  if ("description" in asi) return false;
  return Object.values(asi).every(v => typeof v === "number");
}

const asiIsStructured = computed(() =>
  isStructuredAsi(selectedSpecies.value?.ability_score_increases) &&
  isStructuredAsi(selectedSubrace.value?.ability_score_increases),
);

const racialBonusMap = computed((): Partial<Record<AbilityKey, number>> => {
  if (!asiIsStructured.value || asiMode.value !== "bonus") return {};
  const abilityKeyMap: Record<string, AbilityKey> = {
    str: "str", dex: "dex", con: "con", int: "int", wis: "wis", cha: "cha",
    strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha",
  };
  const map: Partial<Record<AbilityKey, number>> = {};
  const addAsi = (asi: Record<string, number | string>) => {
    for (const [k, v] of Object.entries(asi)) {
      const fk = abilityKeyMap[k.toLowerCase()];
      if (fk && typeof v === "number") map[fk] = (map[fk] ?? 0) + v;
    }
  };
  const base = selectedSpecies.value?.ability_score_increases;
  if (base && !("description" in base)) addAsi(base);
  const sub = selectedSubrace.value?.ability_score_increases;
  if (sub && !("description" in sub)) addAsi(sub);
  return map;
});

function displayScore(key: AbilityKey): number {
  return f[key] + (racialBonusMap.value[key] ?? 0);
}

function totalMod(key: AbilityKey): number {
  return mod(displayScore(key));
}
</script>
