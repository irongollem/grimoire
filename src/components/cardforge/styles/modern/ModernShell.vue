<template>
  <div class="md-shell" :class="[face, { tarot }]" :style="cssVars">
    <slot />
    <div class="md-wm">DUNGEON GRIMOIRE</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { modernTokens as T } from "./modern.tokens";

const {
  frameColor,
  tarot = false,
  face = "front",
} = defineProps<{
  frameColor: string;
  tarot?: boolean;
  face?: "front" | "back";
}>();

const cssVars = computed(() => ({
  "--md-bg": T.bg,
  "--md-back": T.back,
  "--md-panel-top": T.panelTop,
  "--md-panel-bottom": T.panelBottom,
  "--md-text": T.text,
  "--md-text-back": T.textBack,
  "--md-text-muted": T.textMuted,
  "--md-divider": T.divider,
  "--md-stat-pos": T.statPos,
  "--md-stat-neg": T.statNeg,
  "--fc": frameColor,
}));
</script>

<style scoped>
.md-shell {
  position: relative;
  width: 200px;
  height: 280px;
  overflow: hidden;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.7);
  flex-shrink: 0;
  font-family: "Inter", system-ui, sans-serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.md-shell.tarot {
  width: 222px;
  height: 381px;
}

.md-shell.front {
  border-radius: 14px;
  background: var(--md-bg);
  color: var(--md-text);
  border: 1px solid color-mix(in srgb, var(--fc) 35%, transparent);
}

.md-shell.back {
  border-radius: 11px;
  background: var(--md-back);
  color: var(--md-text-back);
  display: flex;
  flex-direction: column;
}

.md-wm {
  position: absolute;
  bottom: 4px;
  left: 0;
  right: 0;
  z-index: 10;
  text-align: center;
  font-family: "Cinzel", serif;
  font-size: 5px;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: rgba(255, 255, 255, 0.18);
  pointer-events: none;
}
</style>
