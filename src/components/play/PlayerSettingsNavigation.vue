<template>
  <SettingsSection title="Navigation" description="Drag to reorder. The first 4 (or 7 on tablet) appear in the quick bar.">
    <ol ref="dragListRef" class="space-y-1">
      <li
        v-for="(item, i) in sortedNav"
        :key="item.to"
        class="relative flex items-center gap-3 rounded-md border border-border px-3 py-2 bg-card select-none transition-colors"
        :class="{ 'opacity-40': draggingIdx === i }"
      >
        <!-- Drop insertion line — shown above the target row -->
        <div
          v-if="overIdx === i && draggingIdx !== null && draggingIdx !== i"
          class="absolute inset-x-1 top-0 h-0.5 rounded-full bg-primary z-10"
          style="transform: translateY(-50%)"
        />
        <!-- Drag handle -->
        <span
          class="cursor-grab active:cursor-grabbing text-muted-foreground touch-none"
          @pointerdown.prevent="onHandlePointerDown(i, $event)"
        >
          <IconDrag class="h-4 w-4 shrink-0" />
        </span>
        <component :is="item.icon" class="h-4 w-4 shrink-0 text-muted-foreground" />
        <span class="font-cinzel text-xs tracking-wider flex-1">{{ item.label }}</span>
        <span
          v-if="i < MOBILE_NAV_SLOTS"
          class="text-label md:text-sm px-1.5 py-0.5 rounded bg-primary/15 text-primary shrink-0"
        >bar</span>
      </li>
    </ol>

    <!-- Drag ghost — floats with the pointer during reorder (visible on iOS touch) -->
    <Teleport to="body">
      <div
        v-if="ghostItem"
        class="fixed z-9999 pointer-events-none flex items-center gap-3 rounded-md border border-primary/60 bg-card px-3 py-2 shadow-2xl"
        :style="{
          top: ghostY + 'px',
          left: ghostLeft + 'px',
          width: ghostWidth + 'px',
          transform: 'translateY(-50%)',
        }"
      >
        <IconDrag class="h-4 w-4 shrink-0 text-muted-foreground" />
        <component :is="ghostItem.icon" class="h-4 w-4 shrink-0 text-muted-foreground" />
        <span class="font-cinzel text-xs tracking-wider flex-1">{{ ghostItem.label }}</span>
      </div>
    </Teleport>
  </SettingsSection>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from "vue";
import SettingsSection from "@/components/common/SettingsSection.vue";
import { IconDrag } from "@/lib/icons";
import { usePlayerNavPrefs } from "@/composables/usePlayerNavPrefs";
import { MOBILE_NAV_SLOTS } from "@/lib/playerNav";

const { sortedNav, setNavOrder } = usePlayerNavPrefs();

const dragListRef = ref<HTMLElement | null>(null);
const draggingIdx = ref<number | null>(null);
const overIdx     = ref<number | null>(null);

const ghostY     = ref(0);
const ghostLeft  = ref(0);
const ghostWidth = ref(280);
const ghostItem  = computed(() =>
  draggingIdx.value !== null ? (sortedNav.value[draggingIdx.value] ?? null) : null
);

function getOverIndex(clientY: number): number {
  if (!dragListRef.value) return 0;
  const items = Array.from(dragListRef.value.children) as HTMLElement[];
  for (let i = 0; i < items.length; i++) {
    const rect = items[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return i;
  }
  return items.length - 1;
}

let activeMove: ((ev: PointerEvent) => void) | null = null;
let activeUp: (() => void) | null = null;

function onHandlePointerDown(index: number, e: PointerEvent) {
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

  const listRect = dragListRef.value?.getBoundingClientRect();
  ghostLeft.value  = listRect?.left ?? 0;
  ghostWidth.value = listRect?.width ?? 280;
  ghostY.value     = e.clientY;

  draggingIdx.value = index;
  overIdx.value     = index;

  activeMove = (ev: PointerEvent) => {
    overIdx.value = getOverIndex(ev.clientY);
    ghostY.value  = ev.clientY;
  };
  activeUp = () => {
    if (draggingIdx.value !== null && overIdx.value !== null && draggingIdx.value !== overIdx.value) {
      const current = sortedNav.value.map((item) => item.to);
      const [moved] = current.splice(draggingIdx.value, 1);
      current.splice(overIdx.value, 0, moved);
      setNavOrder(current);
    }
    draggingIdx.value = null;
    overIdx.value     = null;
    window.removeEventListener("pointermove", activeMove!);
    activeMove = null;
    activeUp   = null;
  };

  window.addEventListener("pointermove", activeMove);
  window.addEventListener("pointerup", activeUp, { once: true });
}

onBeforeUnmount(() => {
  if (activeMove) window.removeEventListener("pointermove", activeMove);
  if (activeUp)   window.removeEventListener("pointerup", activeUp);
});
</script>
