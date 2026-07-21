<template>
  <WizardStepCard>
    <template #header>
      <h3 class="text-label-lg text-muted-foreground uppercase">{{ title }}</h3>
      <span class="font-cinzel text-xs font-bold"
        :class="selectedIds.size === needed ? 'text-green-500' : 'text-primary'">
        {{ selectedIds.size }} / {{ needed }}
      </span>
    </template>

    <p class="font-fell text-sm text-muted-foreground">
      Pick {{ needed }} new {{ isCantrip ? 'cantrip' : 'spell' }}{{ needed > 1 ? 's' : '' }} to learn.
    </p>

    <input
      :value="search"
      type="text"
      :placeholder="isCantrip ? 'Search cantrips…' : 'Search spells…'"
      class="w-full rounded border border-border bg-muted/40 px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      @input="emit('update:search', ($event.target as HTMLInputElement).value)"
    />

    <div class="max-h-64 overflow-y-auto rounded border border-border divide-y divide-border">
      <div v-if="!spells.length" class="px-3 py-4 text-center">
        <p class="font-fell text-sm text-muted-foreground italic">
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
          <p class="font-fell text-[0.6875rem] text-muted-foreground">
            {{ isCantrip ? 'Cantrip' : `Level ${spell.level}` }} · {{ spell.school }}
          </p>
        </div>
        <span v-if="alreadyKnownIds.has(spell.id)" class="font-cinzel text-2xs text-muted-foreground shrink-0">known</span>
        <span v-else-if="selectedIds.has(spell.id)" class="font-cinzel text-2xs text-primary shrink-0">✓</span>
      </button>
    </div>

    <p v-if="selectedIds.size < needed" class="text-label text-muted-foreground">
      You can also add {{ isCantrip ? 'cantrips' : 'spells' }} later from your Spellbook tab.
    </p>
  </WizardStepCard>
</template>

<script setup lang="ts">
import WizardStepCard from "@/components/common/WizardStepCard.vue";

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
} = defineProps<{
  title: string;
  isCantrip: boolean;
  needed: number;
  search: string;
  spells: SpellEntry[];
  selectedIds: Set<string>;
  alreadyKnownIds: Set<string>;
}>();

const emit = defineEmits<{
  "update:search": [value: string];
  toggle: [id: string];
}>();
</script>
