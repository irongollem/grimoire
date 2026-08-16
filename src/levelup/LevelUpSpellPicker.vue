<template>
  <WizardStepCard>
    <template #header>
      <h3 class="text-label-lg text-muted-foreground uppercase">{{ title }}</h3>
      <span class="font-cinzel text-xs font-bold"
        :class="selectedIds.size === needed ? 'text-green-500' : 'text-primary'">
        {{ selectedIds.size }} / {{ needed }}
      </span>
    </template>

    <p class="text-body text-muted-foreground">
      Pick {{ needed }} new {{ isCantrip ? 'cantrip' : 'spell' }}{{ needed > 1 ? 's' : '' }} to learn.
    </p>

    <p v-if="notice" class="text-label text-muted-foreground italic">{{ notice }}</p>

    <AppInput
      :model-value="search"
      type="search"
      tone="muted"
      :placeholder="isCantrip ? 'Search cantrips…' : 'Search spells…'"
      @update:model-value="onSearch"
    />

    <div class="max-h-64 overflow-y-auto rounded border border-border divide-y divide-border">
      <div v-if="isLoading" class="px-3 py-4 text-center">
        <p class="text-body text-muted-foreground italic">
          Loading {{ isCantrip ? 'cantrips' : 'spells' }}…
        </p>
      </div>
      <div v-else-if="!spells.length" class="px-3 py-4 text-center">
        <p class="text-body text-muted-foreground italic">
          {{ search ? `No ${isCantrip ? 'cantrips' : 'spells'} match your search.` : `No ${isCantrip ? 'cantrips' : 'spells'} found for this class.` }}
        </p>
      </div>
      <button
        v-for="spell in spells"
        :key="spell.id"
        type="button"
        class="w-full text-left px-3 py-2 transition-colors flex items-center gap-3"
        :class="[
          alreadyKnownIds.has(spell.id) ? 'opacity-40 cursor-not-allowed' :
          selectedIds.has(spell.id) ? 'bg-primary/10 text-primary' :
          selectedIds.size >= needed ? 'opacity-50 cursor-not-allowed' : 'bg-card text-foreground hover:bg-muted/40'
        ]"
        :disabled="alreadyKnownIds.has(spell.id) || (!selectedIds.has(spell.id) && selectedIds.size >= needed)"
        @click="emit('toggle', spell.id)"
      >
        <div class="flex-1 min-w-0">
          <p class="font-cinzel text-xs font-semibold">{{ spell.name }}</p>
          <p class="text-caption text-muted-foreground">
            {{ isCantrip ? 'Cantrip' : `Level ${spell.level}` }} · {{ spell.school }}
          </p>
        </div>
        <span v-if="alreadyKnownIds.has(spell.id)" class="font-cinzel text-2xs text-muted-foreground shrink-0">known</span>
        <span v-else-if="selectedIds.has(spell.id)" class="font-cinzel text-2xs text-primary shrink-0">✓</span>
      </button>
    </div>

    <!-- This count is not advice: apply_level_up rejects a submission whose class
         spell/cantrip count differs from the requirement, so Confirm stays
         disabled until the picker is full. Saying "you can add these later"
         here (as this line used to) sends the reader looking for a Confirm
         button that will never enable. -->
    <p v-if="selectedIds.size < needed" class="text-label text-muted-foreground">
      {{ needed - selectedIds.size }} more to choose before this level can be confirmed.
    </p>
  </WizardStepCard>
</template>

<script setup lang="ts">
import WizardStepCard from "@/components/common/WizardStepCard.vue";
import AppInput from "@/components/common/AppInput.vue";

interface SpellEntry {
  id: string;
  name: string;
  level: number;
  school: string;
}

const {
  title,
  isCantrip,
  needed,
  search,
  spells,
  selectedIds,
  alreadyKnownIds,
  isLoading = false,
  notice,
} = defineProps<{
  title: string;
  isCantrip: boolean;
  needed: number;
  search: string;
  spells: SpellEntry[];
  selectedIds: Set<string>;
  alreadyKnownIds: Set<string>;
  /** Distinguishes "still fetching" from "this class has nothing to offer". */
  isLoading?: boolean;
  /** Shown above the search box — e.g. why the class filter was widened. */
  notice?: string;
}>();

const emit = defineEmits<{
  "update:search": [value: string];
  toggle: [id: string];
}>();

/** AppInput's model is `string | number | null`; a cleared search box means an
 *  empty query — the list widens back to everything — not an absent one. */
function onSearch(value: string | number | null) {
  emit("update:search", value === null ? "" : String(value));
}
</script>
