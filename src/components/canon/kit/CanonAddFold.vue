<template>
  <div v-if="choices.length > 0" ref="triggerRef" class="self-start" data-testid="canon-add-fold">
    <AppButton
      variant="outline"
      size="sm"
      :icon="IconAdd"
      icon-size="xs"
      label="Add…"
      aria-haspopup="menu"
      :aria-expanded="open"
      data-testid="canon-add-fold-button"
      @click="open = !open"
    />
  </div>

  <!-- Teleported: the pane scrolls inside a column that would clip a menu drawn in place. -->
  <Teleport to="body">
    <div v-if="open && choices.length > 0" ref="floatingRef" :style="floatingStyle" data-slip class="z-[300] min-w-48 rounded-lg border border-border bg-card p-1 shadow-xl" role="menu" aria-label="Add to this entry">
      <AppButton
        v-for="c in choices"
        :key="c.key"
        variant="menu"
        size="sm"
        block
        :label="c.label"
        role="menuitem"
        :data-testid="`canon-add-${c.key}`"
        @click="pick(c.key)"
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * The one "Add…" row an entry pane folds its empty optional blocks into (#1279 item 16): a button that opens a small
 * menu of what is still empty, and says which one was chosen. The pane decides what is empty (from data) and what a
 * choice reveals; this only lists and reports. With nothing left to add the row is not drawn at all.
 */
import { ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { IconAdd } from "@/lib/icons";

const { choices } = defineProps<{ choices: readonly { key: string; label: string }[] }>();
const emit = defineEmits<{ choose: [key: string] }>();

const open = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const { floatingRef, floatingStyle } = useAnchoredPopover(triggerRef, open, () => { open.value = false; });

// The last choice taken leaves the menu empty: it closes with it.
watch(() => choices.length, (n) => { if (n === 0) open.value = false; });

function pick(key: string) {
  open.value = false;
  emit("choose", key);
}
</script>
