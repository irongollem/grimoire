<template>
  <div ref="root" class="contents" :style="{ '--quest-drawer-w': `${width}rem` }">
    <!-- Phone: the column is a bottom sheet; opened wide it is a page of its own. -->
    <template v-if="belowMd">
      <QuestSheet v-if="!open" :quest-id="questId" :mode="mode" :can-open-wide="canOpenWide" @deselect="emit('deselect')" @open-wide="open = true">
        <template #column><slot name="column" /></template>
      </QuestSheet>
      <section v-else class="flex min-w-0 flex-col gap-3 pb-6" aria-label="Opened quest">
        <QuestPhoneTopBar :title="title" :subtitle="subtitle" :fallback-to="questLinkHref(questId)" />
        <AppButton :icon="IconChevronLeft" label="Back to the flow" size="xs" variant="subtle" class="self-start" @click="open = false" />
        <slot name="column" />
        <slot v-if="wideShown" name="wide" />
      </section>
    </template>

    <template v-else>
      <!-- At lg the drawer floats over the grid's right edge and this keeps its rest
           width free, so the flow neither refits nor shifts when the drawer opens over it. -->
      <!-- The drawer's width at rest plus the page's own side padding (PageHeader's
           md:px-6), so the flow keeps the same air to the drawer as to the nav. -->
      <div ref="spacer" class="hidden lg:block lg:w-[calc(var(--quest-drawer-w)+1.5rem)]" aria-hidden="true" />

      <!-- The drawer is one piece, flush to the screen's right edge and running down behind the
           docked deck (which paints after it): the column first,
           the wide part after it. At rest it is exactly the column wide and the wide part
           is not there; opening slides its LEFT edge left, carrying the column with it
           (#1194, frame 10). Below lg it stacks under the flow as a card. -->
      <aside
        ref="drawer"
        class="flex min-w-0 max-w-full flex-col max-lg:rounded-lg max-lg:border max-lg:border-border max-lg:bg-card lg:fixed lg:z-0 lg:w-(--quest-drawer-now)"
        :style="drawerStyle"
        aria-label="Quest drawer"
      >
        <div
          v-if="!wideShown"
          class="absolute inset-y-0 -left-1.5 z-30 hidden w-3 cursor-col-resize touch-none lg:block"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize drawer"
          tabindex="0"
          :aria-valuenow="Math.round(width)"
          :aria-valuemin="DRAWER_MIN_REM"
          :aria-valuemax="DRAWER_MAX_REM"
          @pointerdown="startResize"
          @keydown.left.prevent="width = clampDrawerWidth(width + 1)"
          @keydown.right.prevent="width = clampDrawerWidth(width - 1)"
        />
        <!-- The tab hangs off the drawer's left edge and moves with it. The only way to
             open wide at lg and up; between md and lg a plain button does the same. -->
        <button
          v-if="canOpenWide"
          type="button"
          class="quest-drawer-tab absolute top-5 right-full z-30 hidden cursor-pointer flex-col items-center justify-center gap-2 text-foreground lg:flex"
          :aria-expanded="open"
          :aria-label="open ? 'Fold back' : 'Open wide'"
          @click="open = !open"
        >
          <span class="h-6 w-2 bg-[radial-gradient(circle,var(--muted-foreground)_1.1px,transparent_1.4px)] bg-size-[4.5px_4.5px]" aria-hidden="true" />
          <component :is="open ? IconChevronRight : IconChevronLeft" class="size-4" aria-hidden="true" />
        </button>
        <AppButton
          v-if="canOpenWide"
          :icon="open ? IconChevronRight : IconChevronLeft"
          :label="open ? 'Fold back' : 'Open wide'"
          size="xs"
          variant="subtle"
          class="m-3 mb-0 self-end lg:hidden"
          @click="open = !open"
        />
        <div class="flex min-h-0 flex-1 max-lg:flex-col lg:overflow-hidden lg:pb-[var(--dock-bottom,0px)] lg:border-l lg:border-border lg:bg-card lg:shadow-[-0.5rem_0_1.25rem_rgb(43_32_25/0.07)]">
          <!-- One element in both states: opening moves it with the drawer, it never remounts. -->
          <div class="min-h-0 min-w-0 lg:w-(--quest-drawer-w) lg:shrink-0"><slot name="column" /></div>
          <div v-if="wideMounted" class="min-h-0 min-w-0 max-lg:border-t max-lg:border-border lg:flex-1 lg:overflow-y-auto lg:border-l lg:border-border" aria-label="Wide part">
            <slot name="wide" />
          </div>
        </div>
      </aside>

      <!-- The flow's last 3.5rem stay visible left of the opened drawer; a press on it folds. -->
      <button
        v-if="wideShown"
        type="button"
        class="absolute inset-y-0 left-0 z-10 hidden w-14 cursor-pointer lg:block"
        aria-label="Fold back to the flow"
        @click="open = false"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { onClickOutside, useElementBounding } from "@vueuse/core";
import { useQuestsUiStore } from "@/stores/ui/quests";
import { clampDrawerWidth, DRAWER_MAX_REM, DRAWER_MIN_REM } from "@/lib/quests/drawer";
import { questLinkHref } from "@/lib/quests/navigation";
import { canAnimate, whenSettled } from "@/lib/motion";
import { IconChevronLeft, IconChevronRight } from "@/lib/icons";
import { useBelow } from "@/composables/useBreakpoint";
import { useHotkeys } from "@/composables/useHotkeys";
import QuestSheet from "./QuestSheet.vue";
import QuestPhoneTopBar from "../overview/QuestPhoneTopBar.vue";
import AppButton from "@/components/common/controls/AppButton.vue";

/**
 * The quest screen's drawer (#1194, frames 09 to 11): always a drawer. Small, it
 * is the column at the right of the flow. Wide, the same column stays put and a
 * wide part unfolds to its left over the flow. What it holds follows the
 * selection: nothing selected is the quest, a beat is the beat, a route is the
 * route, which has a column and no wide part.
 */
const { questId, mode, title = "", subtitle } = defineProps<{
  questId: string;
  mode: "quest" | "beat" | "route";
  /** The phone page's title when opened wide: the beat's, or the quest's. */
  title?: string;
  subtitle?: string;
}>();
/** Wide or not. */
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ deselect: [] }>();
defineSlots<{ column(): unknown; wide?(): unknown }>();

/** Below md the column is a bottom sheet instead. */
const belowMd = useBelow("md");

const canOpenWide = computed(() => mode !== "route");
const wideShown = computed(() => open.value && canOpenWide.value);

const width = useQuestsUiStore().drawerWidthFor(questId);

/** The drag measures from the grid's right edge, which is the aside's own. */
function startResize(event: PointerEvent) {
  const handle = event.currentTarget as HTMLElement;
  const aside = handle.parentElement;
  if (!aside) return;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const right = aside.getBoundingClientRect().right;
  handle.setPointerCapture(event.pointerId);
  const move = (next: PointerEvent) => { width.value = clampDrawerWidth((right - next.clientX) / rem); };
  const stop = () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", stop);
    handle.removeEventListener("pointercancel", stop);
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", stop);
  handle.addEventListener("pointercancel", stop);
}

// ── Folding back: the tab, the strip, Escape, a press outside ──
// Escape goes through the registry, which skips text fields, and an open dialog
// or menu binds its own Escape on the overlay layer, which shuts this one out.
useHotkeys(
  [{ combo: "Escape", description: "Fold the drawer back", hidden: true, handler: () => { open.value = false; } }],
  { layer: "page", enabled: () => wideShown.value },
);

/** Things drawn outside the drawer that belong to it: a press in one is not a press away. */
const KEEP_OPEN_WITHIN = ['[role="dialog"]', '[aria-modal="true"]', "[data-slip]", '[role="menu"]', '[role="listbox"]'];
const root = ref<HTMLElement | null>(null);
onClickOutside(root, () => { if (wideShown.value) open.value = false; }, { ignore: KEEP_OPEN_WITHIN });

// ── Opening and folding: the drawer's left edge slides, as one piece ──
// The wide part stays mounted until a fold has finished sliding, so it is clipped
// away by the shrinking drawer rather than vanishing first.
const drawer = ref<HTMLElement | null>(null);

// At lg the drawer is fixed to the viewport so it can run down behind the docked deck
// (the deck is in the page's flow and paints after it); its top is the flow area's top.
// Scroll regions keep `--dock-bottom` of padding so their last line clears the deck.
const spacer = ref<HTMLElement | null>(null);
const flowTop = useElementBounding(spacer).top;
// The root is `display: contents`, so the grid is its parent.
const grid = computed(() => root.value?.parentElement ?? null);
const gridWidth = useElementBounding(grid).width;
const drawerStyle = computed(() => {
  const openPx = gridWidth.value - 3.5 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
  return {
    "--quest-drawer-now": wideShown.value && openPx > 0 ? `${openPx}px` : "var(--quest-drawer-w)",
    top: `${flowTop.value}px`,
    bottom: "0",
    right: "var(--dock-right, 0px)",
  };
});
const wideMounted = ref(wideShown.value);
const atLg = () => window.matchMedia("(min-width: 64rem)").matches;
const SLIDE = { duration: 300, easing: "cubic-bezier(0.2, 0, 0, 1)" };

watch(wideShown, async (shown, _was, onCleanup) => {
  const el = drawer.value;
  const from = el?.getBoundingClientRect().width ?? 0;
  if (shown) wideMounted.value = true;
  let stale = false;
  onCleanup(() => { stale = true; });
  // The new width is in the DOM after the render; measure it and slide there.
  await nextTick();
  if (stale) return;
  if (!el || !atLg() || !canAnimate(el)) { wideMounted.value = shown; return; }
  const to = el.getBoundingClientRect().width;
  whenSettled(el.animate([{ width: `${from}px` }, { width: `${to}px` }], SLIDE), () => { if (!stale) wideMounted.value = shown; });
}, { flush: "pre" });
</script>

<style scoped>
/* The design's tab (frame 10): a card-coloured flap on the drawer's left edge.
   No AppButton variant has this shape, and it is a one-off, so it is drawn here. */
.quest-drawer-tab {
  width: 1.75rem;
  height: 5.5rem;
  padding: 0;
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-right: 0;
  border-radius: 0.45rem 0 0 0.45rem;
}
.quest-drawer-tab:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
</style>
