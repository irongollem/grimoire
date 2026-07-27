<template>
  <Teleport to="body">
    <Transition name="sheet-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-200 flex items-center justify-center p-4"
        @mousedown.self="$emit('close')"
      >
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <div
          class="relative flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hotkey-sheet-title"
        >
          <div class="flex items-center gap-3 border-b border-border px-5 py-4">
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-500/15 text-gold-400">
              <IconKeyboard class="h-4.5 w-4.5" />
            </div>
            <h2 id="hotkey-sheet-title" class="font-cinzel text-sm font-bold tracking-wide text-foreground">
              Keyboard shortcuts
            </h2>
            <button
              type="button"
              class="ml-auto rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
              @click="$emit('close')"
            >
              <IconClose class="h-4 w-4" />
            </button>
          </div>

          <div class="max-h-[60vh] overflow-y-auto px-5 py-4">
            <p v-if="groups.length === 0" class="text-caption text-muted-foreground">
              Nothing is bound on this screen.
            </p>

            <div v-for="group in groups" :key="group.layer" class="mb-4 last:mb-0">
              <h3 class="mb-2 font-cinzel text-2xs uppercase tracking-widest text-muted-foreground/60">
                {{ group.label }}
              </h3>
              <dl class="space-y-1.5">
                <div v-for="hotkey in group.hotkeys" :key="hotkey.combo" class="flex items-baseline gap-3">
                  <dt class="w-24 shrink-0 text-right">
                    <kbd class="rounded border border-border bg-secondary/40 px-1.5 py-0.5 text-caption-sm text-foreground">
                      {{ hotkey.display }}
                    </kbd>
                  </dt>
                  <dd class="flex-1 text-caption text-muted-foreground">{{ hotkey.description }}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
// Renders whatever is bound right now, straight from the registry.
//
// A hand-maintained list would be wrong the first time someone adds a shortcut
// and forgets this file, which is the failure mode that made shortcuts
// undiscoverable in the first place — so it is not hand-maintained.
import { computed } from "vue";
import { IconClose, IconKeyboard } from "@/lib/icons";
import { useActiveHotkeys, useHotkeys, type HotkeyLayer } from "@/composables/useHotkeys";

const { open } = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const hotkeys = useActiveHotkeys();

useHotkeys(
  [{ combo: "escape", description: "Close", handler: () => emit("close"), hidden: true }],
  { layer: "overlay", enabled: () => open },
);

const LAYER_LABELS: Record<HotkeyLayer, string> = {
  overlay: "In this dialog",
  page: "On this screen",
  global: "Anywhere",
};

const groups = computed(() => {
  // Reading the sheet with it open would otherwise list only the sheet's own
  // Escape binding, since an overlay suppresses everything beneath it.
  const order: HotkeyLayer[] = ["page", "global"];
  return order
    .map((layer) => ({
      layer,
      label: LAYER_LABELS[layer],
      hotkeys: hotkeys.value.filter((h) => h.layer === layer),
    }))
    .filter((group) => group.hotkeys.length > 0);
});
</script>

<style scoped>
.sheet-fade-enter-active,
.sheet-fade-leave-active {
  transition: opacity 0.15s ease;
}
.sheet-fade-enter-from,
.sheet-fade-leave-to {
  opacity: 0;
}
</style>
