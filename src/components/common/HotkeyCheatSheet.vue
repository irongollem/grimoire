<template>
  <AppModal :open="open" size="md" @close="$emit('close')">
    <ModalHeader
      title="Keyboard shortcuts"
      :icon="IconKeyboard"
      tone="gold"
      closeable
      @close="$emit('close')"
    />

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
import { IconKeyboard } from "@/lib/icons";
import { useActiveHotkeys, type HotkeyLayer } from "@/composables/useHotkeys";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";

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
