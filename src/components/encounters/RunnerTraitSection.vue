<template>
  <template v-for="section in sections" :key="section.label">
    <template v-if="section.traits?.length">
      <div class="detail-divider" />
      <p class="detail-section-label">{{ section.label }}</p>
      <div v-for="t in section.traits" :key="t.name" class="detail-trait">
        <div class="detail-trait-header">
          <strong>{{ t.name }}.</strong>
          <div class="trait-roll-bar">
            <button
              v-if="parseAttackBonus(t.description) !== null"
              type="button"
              class="trait-roll-btn trait-atk-btn"
              @click.stop="emit('rollAttack', parseAttackBonus(t.description) ?? 0, t.name)"
            >⚔ {{ (parseAttackBonus(t.description) ?? 0) >= 0 ? '+' : '' }}{{ parseAttackBonus(t.description) ?? 0 }}</button>
            <button
              v-if="hasRollableDice(t.description)"
              type="button"
              class="trait-roll-btn trait-dmg-btn"
              @click.stop="emit('rollDamage', t.description, t.name)"
            >🎲 {{ actionDiceLabel(t.description) }}</button>
          </div>
        </div>
        <span class="detail-trait-desc" v-html="renderTraitDesc(t.description)"></span>
      </div>
    </template>
  </template>
</template>

<script setup lang="ts">
import { parseExpression } from "@/lib/dice";
import { renderTiptapHtml } from "@/lib/renderTiptap";

export interface TraitEntry {
  name: string;
  description: string;
}

export interface TraitSection {
  label: string;
  traits?: TraitEntry[];
}

defineProps<{
  sections: TraitSection[];
}>();

const emit = defineEmits<{
  rollAttack: [bonus: number, name: string];
  rollDamage: [description: string, name: string];
}>();

function parseAttackBonus(desc: string): number | null {
  const m = desc.match(/([+-]\d+)\s+to\s+hit/i);
  if (m) return parseInt(m[1]);
  const m2 = desc.match(/^([+-]\d+)\s/);
  return m2 ? parseInt(m2[1]) : null;
}

function hasRollableDice(desc: string): boolean {
  const parsed = parseExpression(desc);
  return !!parsed && parsed.terms.length > 0;
}

function actionDiceLabel(desc: string): string {
  const parsed = parseExpression(desc);
  if (!parsed || !parsed.terms.length) return "";
  const diceStr = parsed.terms.map((t) => `${t.count}d${t.sides}`).join("+");
  const mod = parsed.modifier;
  return diceStr + (mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : "");
}

function renderTraitDesc(desc: string): string {
  return renderTiptapHtml(desc);
}
</script>

<style scoped>
@reference "@/assets/main.css";

.detail-divider {
  @apply border-t border-border/60 my-1;
}

.detail-section-label {
  @apply font-cinzel text-2xs font-bold tracking-wider text-muted-foreground uppercase mt-1;
}

.detail-trait {
  @apply font-fell text-xs text-foreground leading-relaxed;
}

.detail-trait-header {
  @apply flex items-start justify-between gap-2 mb-0.5;
}

.detail-trait-desc {
  @apply block text-muted-foreground;
}

.trait-roll-bar {
  @apply flex gap-1 flex-wrap shrink-0;
}

.trait-roll-btn {
  @apply inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-cinzel text-[0.5625rem] font-semibold tracking-wider cursor-pointer transition-colors whitespace-nowrap;
}

.trait-atk-btn {
  @apply bg-blue-500/15 text-blue-500 border border-blue-500/30 hover:bg-blue-500/25;
}

.trait-dmg-btn {
  @apply bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25;
}
</style>
