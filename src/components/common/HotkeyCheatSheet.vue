<template>
  <AppModal :open="open" size="md" labelled-by="hotkey-sheet-title" @close="$emit('close')">
    <div class="flex items-center gap-3 border-b border-border px-5 py-4">
      <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-500/15 text-gold-400">
        <IconKeyboard class="h-4.5 w-4.5" />
      </div>
      <h2 id="hotkey-sheet-title" class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Keyboard shortcuts
      </h2>
      <AppButton
        variant="ghost"
        size="icon-xs"
        icon-size="md"
        class="ml-auto"
        :icon="IconClose"
        aria-label="Close"
        @click="$emit('close')"
      />
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
  </AppModal>
</template>

<script setup lang="ts">
// Renders whatever is bound right now, straight from the registry.
//
// A hand-maintained list would be wrong the first time someone adds a shortcut
// and forgets this file, which is the failure mode that made shortcuts
// undiscoverable in the first place — so it is not hand-maintained.
import { computed } from "vue";
import { IconClose, IconKeyboard } from "@/lib/icons";
import { useActiveHotkeys, type HotkeyLayer } from "@/composables/useHotkeys";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";

const { open } = defineProps<{ open: boolean }>();
defineEmits<{ close: [] }>();

const hotkeys = useActiveHotkeys();

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
