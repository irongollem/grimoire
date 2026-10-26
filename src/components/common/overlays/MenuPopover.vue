<template>
  <div ref="triggerRef" class="inline-flex">
    <slot name="trigger" :toggle="toggle" :open="open" />
  </div>

  <!-- Teleported: a card or slip clips overflow, which would cut the list off. -->
  <Teleport to="body">
    <div
      v-if="open"
      ref="floatingRef"
      v-bind="$attrs"
      :style="floatingStyle"
      data-slip
      class="z-300 w-64 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg"
      role="menu"
      :aria-label="label"
      @keydown="onKeydown"
    >
      <slot :close="close" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * A menu panel anchored to a trigger: the shell the connection and kin type
 * pickers share. It owns the open state, the anchored position, focus on the
 * checked entry (or the first) when it opens, and the keys: arrows, Home and
 * End move between the entries, Escape closes and hands focus back to the
 * trigger. The caller draws the trigger and the rows; attributes (a test id)
 * land on the panel.
 */
import { nextTick, ref } from "vue";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { useHotkeys } from "@/composables/useHotkeys";

defineOptions({ inheritAttrs: false });
defineProps<{ label: string }>();
const emit = defineEmits<{ open: [] }>();

const open = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const { floatingRef, floatingStyle } = useAnchoredPopover(triggerRef, open, () => {
  open.value = false;
});

function items(): HTMLButtonElement[] {
  return floatingRef.value ? [...floatingRef.value.querySelectorAll<HTMLButtonElement>("button:not([disabled])")] : [];
}

async function toggle() {
  open.value = !open.value;
  if (!open.value) return;
  emit("open");
  // Wait for the panel to mount, then put focus on the checked entry (or the first).
  await nextTick();
  const all = items();
  (all.find((b) => b.getAttribute("aria-checked") === "true") ?? all[0])?.focus();
}

function close(refocus: boolean) {
  open.value = false;
  if (refocus) triggerRef.value?.querySelector("button")?.focus();
}

/**
 * Escape goes through the hotkey registry's overlay layer, as RevealControl's does, rather than the panel's own
 * keydown: inside a modal the modal's Escape is registered there too, and the most recent registration answers, so
 * the first Escape closes this list and only the next one the sheet. Enabled only while open.
 */
useHotkeys(
  () => [{ combo: "escape", description: "Close the list", hidden: true, handler: () => close(true) }],
  { layer: "overlay", enabled: () => open.value },
);

function onKeydown(e: KeyboardEvent) {
  const all = items();
  if (all.length === 0) return;
  const at = all.indexOf(document.activeElement as HTMLButtonElement);
  let next: number | null = null;
  if (e.key === "ArrowDown") next = at < 0 ? 0 : (at + 1) % all.length;
  else if (e.key === "ArrowUp") next = at <= 0 ? all.length - 1 : at - 1;
  // Home and End belong to a filter's text caret while it has focus.
  else if (e.key === "Home" && at >= 0) next = 0;
  else if (e.key === "End" && at >= 0) next = all.length - 1;
  if (next === null) return;
  e.preventDefault();
  all[next]?.focus();
}
</script>
