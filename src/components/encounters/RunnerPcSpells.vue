<template>
  <div class="detail-divider" />
  <p class="detail-section-label">{{ casterType === 'known' ? 'Known Spells' : 'Prepared Spells' }}</p>
  <div v-for="entry in spells" :key="entry.id" class="detail-spell">
    <div class="spell-info">
      <span class="spell-level-badge">{{ entry.spell.level === 0 ? 'C' : entry.spell.level }}</span>
      <span class="spell-name">{{ entry.spell.name }}</span>
    </div>
    <div class="spell-rolls">
      <button
        v-if="entry.spell.damage_rolls?.length"
        type="button"
        class="trait-roll-btn trait-dmg-btn"
        @click.stop="emit('roll-spell', entry.spell)"
      >🎲 {{ entry.spell.damage_rolls[0].dice }}</button>
      <span
        v-if="entry.spell.attack_type === 'save' && spellSaveDc"
        class="spell-save-badge"
      >DC {{ spellSaveDc }} {{ entry.spell.save_attribute }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Spell } from "@/types/spell.types";

defineProps<{
  spells: { id: string; spell: Spell; is_prepared: boolean }[];
  casterType: string;
  spellSaveDc: number | null;
}>();

const emit = defineEmits<{
  "roll-spell": [spell: Spell];
}>();
</script>

<style scoped>
@reference "@/assets/main.css";

.detail-divider {
  @apply border-t border-border/60 my-1;
}

.detail-section-label {
  @apply font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground uppercase mt-1;
}

.detail-spell {
  @apply flex items-center justify-between gap-2 py-1 border-b border-border/30 last:border-b-0;
}

.spell-info {
  @apply flex items-center gap-1.5 min-w-0 flex-1;
}

.spell-name {
  @apply font-fell text-xs text-foreground truncate;
}

.spell-level-badge {
  @apply font-cinzel text-[9px] font-bold text-muted-foreground bg-muted rounded px-1 shrink-0;
}

.spell-rolls {
  @apply flex items-center gap-1 shrink-0;
}

.trait-roll-btn {
  @apply inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-cinzel text-[9px] font-semibold tracking-wider cursor-pointer transition-colors whitespace-nowrap;
}

.trait-dmg-btn {
  @apply bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25;
}

.spell-save-badge {
  @apply font-cinzel text-[9px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30;
}
</style>
