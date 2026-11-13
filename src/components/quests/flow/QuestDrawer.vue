<template>
  <div class="contents">
    <QuestSheet v-if="belowMd && !opened" :quest-id="questId" :mode="mode" @deselect="emit('deselect')">
      <template #quest><slot name="quest" /></template>
      <template #beat><slot name="beat" /></template>
      <template #route><slot name="route" /></template>
    </QuestSheet>
    <!-- The summary column. While opened at lg it stays in the grid, empty and
         invisible, so the flow keeps its size and does not refit under the
         overlay; below lg the opened content replaces it in flow. -->
    <aside
      class="relative flex min-w-0 max-w-full flex-col gap-3 lg:h-full lg:min-h-0 lg:w-(--quest-drawer-w)"
      :class="[opened ? 'max-lg:hidden lg:invisible' : '', 'max-md:hidden']"
      :style="{ '--quest-drawer-w': `${width}rem` }"
      aria-label="Quest drawer"
    >
      <div
        class="absolute inset-y-0 -left-1.5 z-10 hidden w-3 cursor-col-resize touch-none lg:block"
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
      <template v-if="!opened">
        <AppButton
          v-if="mode === 'beat'"
          :icon="IconChevronLeft"
          label="Open"
          size="xs"
          variant="subtle"
          class="hidden self-end lg:inline-flex"
          @click="emit('update:opened', true)"
        />
        <slot :name="mode" />
      </template>
    </aside>

    <Transition :css="false" @enter="onEnter" @leave="onLeave">
      <div
        v-if="opened"
        class="relative flex min-w-0 max-w-full flex-col lg:absolute lg:inset-y-0 lg:right-0 lg:left-14 lg:z-20 lg:min-h-0 lg:bg-card"
        aria-label="Opened beat"
      >
        <!-- From md the opened beat's own header carries "Flow"; below it that
             header gives way to the phone top bar, whose back button leaves
             the page, so the way back to the flow is drawn here instead. -->
        <AppButton
          :icon="IconChevronLeft"
          label="Back to the flow"
          size="xs"
          variant="subtle"
          class="mb-2 self-start md:hidden"
          @click="emit('update:opened', false)"
        />
        <div class="min-h-0 flex-1 lg:overflow-y-auto"><slot name="opened" /></div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { useQuestsUiStore } from "@/stores/ui/quests";
import { clampDrawerWidth, DRAWER_MAX_REM, DRAWER_MIN_REM } from "@/lib/quests/drawer";
import { canAnimate, whenSettled } from "@/lib/motion";
import { IconChevronLeft } from "@/lib/icons";
import { useBelow } from "@/composables/useBreakpoint";
import QuestSheet from "./QuestSheet.vue";
import AppButton from "@/components/common/controls/AppButton.vue";

const { questId, mode, opened = false } = defineProps<{
  questId: string;
  /** What the closed drawer shows: the quest, the selected beat, or the selected route. */
  mode: "quest" | "beat" | "route";
  opened?: boolean;
}>();
const emit = defineEmits<{ "update:opened": [opened: boolean]; deselect: [] }>();
/** Below md the summary column is a bottom sheet instead. */
const belowMd = useBelow("md");
defineSlots<{ quest(): unknown; beat(): unknown; route(): unknown; opened(): unknown }>();

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

// The overlay only exists at lg; below it the opened content is in flow and
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
