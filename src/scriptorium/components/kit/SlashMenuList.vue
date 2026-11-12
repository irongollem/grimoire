<template>
  <div
    data-slip
    role="listbox"
    aria-label="Insert a block"
    class="z-300 w-72 max-h-72 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg"
    data-testid="slash-menu"
  >
    <p v-if="items.length === 0" class="px-3 py-2 text-caption italic text-muted-foreground">No block by that name.</p>
    <AppButton
      v-for="(entry, at) in items"
      :key="entry.label"
      variant="menu"
      size="body"
      block
      role="option"
      :aria-selected="at === selected"
      :active="at === selected"
      :data-index="at"
      @mouseenter="selected = at"
      @mousedown.prevent
      @click="choose(at)"
    >
      <template #icon>
        <component :is="entry.icon" class="size-4 shrink-0 text-primary" />
      </template>
      <span class="min-w-0">
        <span class="block text-caption font-semibold leading-tight text-foreground">{{ entry.kit ?? entry.label }}</span>
        <span class="block truncate text-caption italic leading-snug text-muted-foreground">{{ blockBlurb(entry) }}</span>
      </span>
    </AppButton>
  </div>
</template>

<script setup lang="ts">
/**
 * The "/" menu (#1176 frame 13): every block, by name with one line of what it
 * is. It never takes focus, so the writer keeps typing in the page; the page's
 * suggestion plugin forwards the keys here (`onKeyDown`).
 */
import { nextTick, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { blockBlurb, type BlockEntry } from "@/scriptorium/lib/blockRegistry";

const { items, command } = defineProps<{
  items: BlockEntry[];
  command: (entry: BlockEntry) => void;
}>();

const selected = ref(0);
watch(
  () => items,
  () => {
    selected.value = 0;
  },
);
watch(selected, async (at) => {
  await nextTick();
  document.querySelector(`[data-testid="slash-menu"] [data-index="${at}"]`)?.scrollIntoView({ block: "nearest" });
});

function choose(at: number) {
  const entry = items[at];
  if (entry) command(entry);
}

/** The keys the page hands over; true when one was taken. */
function onKeyDown({ event }: { event: KeyboardEvent }): boolean {
  if (items.length === 0) return false;
  if (event.key === "ArrowDown") {
    selected.value = (selected.value + 1) % items.length;
    return true;
  }
  if (event.key === "ArrowUp") {
    selected.value = (selected.value - 1 + items.length) % items.length;
    return true;
  }
  if (event.key === "Enter") {
    choose(selected.value);
    return true;
  }
  return false;
}

defineExpose({ onKeyDown });
</script>
