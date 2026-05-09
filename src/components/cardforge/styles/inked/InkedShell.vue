<template>
  <div class="ik-shell" :class="{ tarot }" :style="cssVars">
    <slot />
    <div class="ik-wm">DUNGEON GRIMOIRE</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { inkedTokens as T } from "./inked.tokens";
import type { Accent } from "../tokens.shared";

const { accent, tarot = false } = defineProps<{
  accent: Accent;
  tarot?: boolean;
}>();

const cssVars = computed(() => ({
  "--ik-bg": T.bg,
  "--ik-bg-alt": T.bgAlt,
  "--ik-bottom-panel": T.bottomPanel,
  "--ik-abilities-row": T.abilitiesRow,
  "--ik-text": T.text,
  "--ik-text-sub": T.textSub,
  "--ik-text-muted": T.textMuted,
  "--ik-stat-pos": T.statPos,
  "--ik-stat-neg": T.statNeg,
  "--acc-tag": accent.tag,
  "--acc-line": accent.line,
  "--acc-text": accent.text,
}));
</script>

<style scoped>
.ik-shell {
  position: relative;
  width: 200px;
  height: 280px;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--ik-bg);
  color: var(--ik-text);
  box-shadow:
    0 8px 22px rgba(0, 0, 0, 0.7),
    0 0 0 1px rgba(0, 0, 0, 0.5);
  flex-shrink: 0;
  font-family: "Cardo", serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.ik-shell.tarot {
  width: 222px;
  height: 381px;
}
.ik-wm {
  position: absolute;
  bottom: 4px;
  left: 0;
  right: 0;
  z-index: 10;
  text-align: center;
  font-family: "Cinzel", serif;
  font-size: 5px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--ik-text-muted);
  opacity: 0.5;
  pointer-events: none;
}
</style>
