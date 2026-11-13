<template>
  <div>
    <!-- Keeps the outline's last row clear of the sheet. -->
    <div aria-hidden="true" :style="{ height: heights[level] }" />
    <section
      ref="sheet"
      class="fixed inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-xl border-t border-border bg-card shadow-lg"
      :style="{ height: heights[level] }"
      aria-label="Quest sheet"
      :data-level="level"
    >
      <button
        type="button"
        class="flex h-11 w-full shrink-0 touch-none items-center justify-center"
        :aria-label="level === 'peek' ? 'Expand' : 'Collapse'"
        :aria-expanded="level !== 'peek'"
        @pointerdown="dragStart"
        @pointermove="dragMove"
        @pointerup="dragEnd"
        @pointercancel="dragCancel"
        @click="onHandle"
      >
        <span class="h-1 w-10 rounded-full bg-border" aria-hidden="true" />
      </button>
      <div v-if="level === 'peek'" class="flex items-center gap-3 px-4 pb-3">
        <div class="min-w-0 flex-1">
          <p class="text-eyebrow text-muted-foreground">The quest</p>
          <p class="truncate text-body">{{ statusLine }}</p>
        </div>
        <AppButton :icon="IconPlay" label="Run" size="md" variant="primary" @click="run" />
      </div>
      <div v-else class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <slot :name="mode" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, toRef, watch } from "vue";
import { useRouter } from "vue-router";
import { useQuestClocks } from "@/composables/quests/useQuestClocks";
import { useQuestObjectives } from "@/composables/quests/useQuests";
import { questLink } from "@/lib/quests/navigation";
import { canAnimate, whenSettled } from "@/lib/motion";
import { IconPlay } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";

const { questId, mode } = defineProps<{ questId: string; mode: "quest" | "beat" | "route" }>();
const emit = defineEmits<{ deselect: [] }>();
defineSlots<{ quest(): unknown; beat(): unknown; route(): unknown }>();

const router = useRouter();
const objectives = useQuestObjectives(toRef(() => questId));
const clocks = useQuestClocks(toRef(() => questId));

const heights = { peek: "5.75rem", half: "60dvh", full: "85dvh" } as const;
/** Only the quest panel has a bigger size; a selection is always half. */
const expanded = ref(false);
const level = computed<keyof typeof heights>(() => (mode !== "quest" ? "half" : expanded.value ? "full" : "peek"));
watch(() => mode, () => { expanded.value = false; });

const statusLine = computed(() => {
  const all = (objectives.data.value ?? []).filter((o) => o.status !== "dormant");
  const done = all.filter((o) => o.status === "complete").length;
  const parts = [`${done} of ${all.length} objectives`];
  const clock = (clocks.data.value ?? []).find((c) => c.filled < c.segments);
  if (clock) parts.push(`${clock.label} ${clock.filled}/${clock.segments}`);
  return parts.join(" · ");
});

function run() {
  void router.push(questLink(questId, { party: true }));
}

function raise() { expanded.value = true; }
function lower() {
  if (mode === "quest") expanded.value = false;
  else emit("deselect");
}

const sheet = ref<HTMLElement | null>(null);
let before = 0;
watch(level, async (_next, _prev, onCleanup) => {
  const el = sheet.value;
  if (!el || !canAnimate(el) || !before) return;
  const from = before;
  let stale = false;
  onCleanup(() => { stale = true; });
  await nextTick();
  if (stale) return;
  whenSettled(el.animate([{ height: `${from}px` }, { height: heights[level.value] }], { duration: 260, easing: "cubic-bezier(0.2, 0, 0, 1)" }), () => {});
}, { flush: "pre" });
watch(level, () => { before = 0; }, { flush: "post" });
function measure() { before = sheet.value?.getBoundingClientRect().height ?? 0; }

const DRAG_PX = 40;
let startY: number | null = null;
let dragged = false;
function dragStart(event: PointerEvent) {
  startY = event.clientY;
  dragged = false;
  measure();
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}
function dragMove(event: PointerEvent) {
  if (startY !== null && Math.abs(event.clientY - startY) > DRAG_PX) dragged = true;
}
function dragEnd(event: PointerEvent) {
  if (startY === null) return;
  const dy = event.clientY - startY;
  startY = null;
  if (dy < -DRAG_PX) raise();
  else if (dy > DRAG_PX) lower();
}
function dragCancel() { startY = null; dragged = false; }
function onHandle() {
  if (dragged) { dragged = false; return; }
  measure();
  if (level.value === "peek") raise();
  else lower();
}
</script>
