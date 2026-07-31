<template>
  <Teleport to="body">
    <div
      v-if="state.visible"
      class="fixed inset-0 z-[60]"
      @click="dismiss"
      @contextmenu.prevent="dismiss"
    >
      <div
        class="roll-mode-menu"
        :style="menuStyle"
        @click.stop
      >
        <p class="menu-title">Roll as…</p>
        <button
          v-for="opt in OPTIONS"
          :key="opt.value"
          type="button"
          class="menu-item"
          :class="opt.cls"
          @click="choose(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import type { CSSProperties } from "vue";
import type { RollMode } from "@/lib/dice/roller";
import { rollModePickerState, resolveRollModePicker } from "@/composables/useRollModePicker";

const state = rollModePickerState;

const OPTIONS: { value: RollMode; label: string; cls: string }[] = [
  { value: "advantage", label: "Advantage", cls: "opt-adv" },
  { value: "normal", label: "Normal", cls: "opt-normal" },
  { value: "disadvantage", label: "Disadvantage", cls: "opt-dis" },
];

// Anchor the menu near the pointer, nudged so it stays on screen. Sizes are
// approximate — enough to avoid spilling off the right/bottom edges.
const MENU_W = 168;
const MENU_H = 140;
const menuStyle = computed<CSSProperties>(() => {
  const pad = 8;
  const maxX = window.innerWidth - MENU_W - pad;
  const maxY = window.innerHeight - MENU_H - pad;
  return {
    left: `${Math.max(pad, Math.min(state.value.x, maxX))}px`,
    top: `${Math.max(pad, Math.min(state.value.y, maxY))}px`,
  };
});

function choose(mode: RollMode) {
  resolveRollModePicker(mode);
}
function dismiss() {
  resolveRollModePicker(null);
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && state.value.visible) dismiss();
}

onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<style scoped>
@reference "@/assets/main.css";

.roll-mode-menu {
  @apply fixed w-42 rounded-lg border border-border bg-card shadow-2xl p-1 flex flex-col gap-0.5;
}
.menu-title {
  @apply text-label font-semibold text-muted-foreground px-2 pt-1 pb-0.5;
}
.menu-item {
  @apply text-left font-cinzel text-sm font-bold tracking-wider rounded-md px-3 py-2 text-foreground transition-colors;
}
.opt-adv:hover { @apply bg-green-500/15 text-green-600 dark:text-green-400; }
.opt-normal:hover { @apply bg-muted/60; }
.opt-dis:hover { @apply bg-destructive/15 text-destructive; }
</style>
