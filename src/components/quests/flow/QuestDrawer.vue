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
      <!-- The column: one element at every size and in both states, so opening
           the wide part moves and resizes nothing in it (#1194, frame 10). -->
      <aside
        class="flex min-w-0 max-w-full flex-col border-border bg-card max-lg:rounded-lg max-lg:border lg:relative lg:h-full lg:min-h-0 lg:w-(--quest-drawer-w) lg:border-l lg:shadow-[-0.5rem_0_1.25rem_rgb(43_32_25/0.07)]"
        aria-label="Quest drawer"
      >
        <div
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
        <!-- Between md and lg the drawer stacks under the flow and has no edge to
             hang a tab on, so the same move is a plain button. -->
        <AppButton
          v-if="canOpenWide"
          :icon="open ? IconChevronRight : IconChevronLeft"
          :label="open ? 'Fold back' : 'Open wide'"
          size="xs"
          variant="subtle"
          class="m-3 mb-0 self-end lg:hidden"
          @click="open = !open"
        />
        <div class="min-h-0 flex-1"><slot name="column" /></div>
      </aside>

      <Transition :css="false" @enter="onEnter" @leave="onLeave">
        <div
          v-if="wideShown"
          class="flex min-w-0 max-w-full flex-col border-border bg-card max-lg:order-last max-lg:rounded-lg max-lg:border lg:absolute lg:inset-y-0 lg:right-(--quest-drawer-w) lg:left-14 lg:z-20 lg:min-h-0 lg:border-l lg:shadow-[-0.5rem_0_1.25rem_rgb(43_32_25/0.07)]"
          aria-label="Wide part"
        >
          <div class="min-h-0 flex-1 lg:overflow-y-auto"><slot name="wide" /></div>
        </div>
      </Transition>

      <!-- The flow's last 3.5rem stay visible beside the wide part; a press on it folds. -->
      <button
        v-if="wideShown"
        type="button"
        class="absolute inset-y-0 left-0 z-20 hidden w-14 cursor-pointer lg:block"
        aria-label="Fold back to the flow"
        @click="open = false"
      />

      <!-- The tab hangs off the drawer's left edge, which is the wide part's edge
           while it is open. The only way to open wide, at lg and up. -->
      <button
        v-if="canOpenWide"
        type="button"
        class="quest-drawer-tab absolute top-5 z-30 hidden cursor-pointer flex-col items-center justify-center gap-2 text-foreground lg:flex"
        :class="open ? 'left-14 -translate-x-full' : 'right-(--quest-drawer-w)'"
        :aria-expanded="open"
        :aria-label="open ? 'Fold back' : 'Open wide'"
        @click="open = !open"
      >
        <span class="h-6 w-2 bg-[radial-gradient(circle,var(--muted-foreground)_0.07rem,transparent_0.09rem)] bg-size-[0.28rem_0.28rem]" aria-hidden="true" />
        <component :is="open ? IconChevronRight : IconChevronLeft" class="size-4" aria-hidden="true" />
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onClickOutside } from "@vueuse/core";
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

// The overlay only exists at lg; below it the wide part is in flow and
// sliding it in from the side would be a lie.
const atLg = () => window.matchMedia("(min-width: 64rem)").matches;

function onEnter(el: Element, done: () => void) {
  if (!atLg() || !canAnimate(el)) return done();
  whenSettled((el as HTMLElement).animate([{ transform: "translateX(100%)", opacity: 0 }, { transform: "translateX(0)", opacity: 1 }], { duration: 240, easing: "cubic-bezier(0.2, 0, 0, 1)" }), done);
}

function onLeave(el: Element, done: () => void) {
  if (!atLg() || !canAnimate(el)) return done();
  whenSettled((el as HTMLElement).animate([{ transform: "translateX(0)", opacity: 1 }, { transform: "translateX(100%)", opacity: 0 }], { duration: 200, easing: "ease-in" }), done);
}
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
