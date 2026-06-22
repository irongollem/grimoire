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
        v-if="(entry.spell.attack_type === 'ranged_spell' || entry.spell.attack_type === 'melee_spell') && spellAttackBonus !== null"
        type="button"
        class="trait-roll-btn trait-atk-btn"
        title="Roll spell attack (d20 + attack bonus)"
        @click.stop="emit('roll-attack', spellAttackBonus, entry.spell.name)"
      >🎲 Atk {{ signedNum(spellAttackBonus) }}</button>
      <button
        v-if="entry.spell.damage_rolls?.length"
        type="button"
        class="trait-roll-btn trait-dmg-btn"
        @click.stop="emit('roll-spell', entry.spell)"
      >🎲 {{ entry.spell.damage_rolls[0].dice }}</button>
      <button
        v-if="entry.spell.attack_type === 'save' && spellSaveDc"
        type="button"
        class="trait-roll-btn spell-save-btn"
        title="Announce saving throw to the table"
        @click.stop="emit('roll-spell-save', entry.spell, spellSaveDc)"
      >DC {{ spellSaveDc }} {{ entry.spell.save_attribute }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Spell } from "@/types/spell.types";
import { signedNum } from "@/lib/utils";

defineProps<{
  spells: { id: string; spell: Spell; is_prepared: boolean }[];
  casterType: string;
  spellSaveDc: number | null;
  spellAttackBonus: number | null;
}>();

const emit = defineEmits<{
  "roll-spell": [spell: Spell];
  "roll-attack": [bonus: number, name: string];
  "roll-spell-save": [spell: Spell, dc: number];
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

.trait-atk-btn {
  @apply bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20;
}

.spell-save-btn {
  @apply text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20;
}
</style>
