<script setup lang="ts">
/**
 * Turning the page (#1085). This is the one place that knows how a turn looks: show `target`, and when it changes,
 * animate from where the book was to there. Wave 4 swaps the leaf below for a real page-curl library; its job is
 * only to honour this interface (a `target` in, a `page` slot per face, `done` out), so nothing outside needs to
 * change when it does.
 *
 * A wide book turns a leaf hinged at the spine: the old recto lifts and swings over, its back being the new
 * verso, while the new recto is already waiting underneath. A phone turns its single page the same way, hinged at
 * the left edge. Under prefers-reduced-motion, or where the Web Animations API is missing, the new spread
 * cross-fades in instead.
 */
import { nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import type { ReadingMode } from "@/lib/openBook/pagination";
import { canAnimate, prefersReducedMotion, whenSettled } from "@/lib/motion";
import type { PageTarget } from "./readerContext";

const { target, mode, instant = false } = defineProps<{
  target: PageTarget;
  mode: ReadingMode;
  /** Show the new target at once, with no turn: the reader correcting an address, not the visitor turning. */
  instant?: boolean;
}>();
const emit = defineEmits<{ done: [] }>();

defineSlots<{
  /** One page face. `live` is false for the faces of a leaf in flight. */
  page(props: { target: PageTarget; side: "verso" | "recto"; live: boolean }): unknown;
  /** Chrome that belongs to the open spread, not to a leaf (the dog-ears, the ribbons, the tabs). */
  default?(): unknown;
}>();

/** The duration of a leaf's swing. Slower than a panel hop because a turn has to be seen to rotate. */
const TURN_MS = 900;
const EASING = "cubic-bezier(0.45, 0.05, 0.2, 1)";
const FADE_MS = 260;

const shown = ref<PageTarget>(target);
interface Leaf {
  dir: "next" | "prev";
  from: PageTarget;
  to: PageTarget;
}
const leaf = ref<Leaf | null>(null);

const root = useTemplateRef<HTMLElement>("root");
const leafEl = useTemplateRef<HTMLElement>("leafEl");
const shadeFront = useTemplateRef<HTMLElement>("shadeFront");
const shadeBack = useTemplateRef<HTMLElement>("shadeBack");
let running: Animation[] = [];
/** A cancelled animation still reports as settled; only the newest turn may finish the book. */
let turnId = 0;

function sameTarget(a: PageTarget, b: PageTarget): boolean {
  return a.key === b.key && a.unit === b.unit;
}

function settle() {
  for (const a of running) a.cancel();
  running = [];
  leaf.value = null;
  shown.value = target;
  emit("done");
}

async function turn(from: PageTarget, to: PageTarget) {
  const dir = to.order > from.order ? "next" : "prev";
  if (!root.value || !canAnimate(root.value)) {
    shown.value = to;
    emit("done");
    return;
  }
  const id = turnId;
  leaf.value = { dir, from, to };
  await nextTick();
  if (id !== turnId) return;
  const el = leafEl.value;
  if (!el) {
    settle();
    return;
  }
  const keyframes: Keyframe[] =
    dir === "next"
      ? [{ transform: "rotateY(0deg)" }, { transform: "rotateY(-180deg)" }]
      : [{ transform: "rotateY(-180deg)" }, { transform: "rotateY(0deg)" }];
  const swing = el.animate(keyframes, { duration: TURN_MS, easing: EASING, fill: "forwards" });
  const shades = [shadeFront.value, shadeBack.value].flatMap((s) =>
    s ? [s.animate([{ opacity: 0 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }], { duration: TURN_MS, easing: "ease-in-out" })] : [],
  );
  running = [swing, ...shades];
  whenSettled(swing, () => {
    if (id === turnId) settle();
  });
}

/** The cross-fade for a reader who asked for less motion. */
function fade() {
  const el = root.value;
  if (el && canAnimate(el)) {
    const a = el.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: FADE_MS, easing: "ease" });
    whenSettled(a, () => emit("done"));
  } else {
    emit("done");
  }
}

watch(
  () => target,
  (to) => {
    // The reader recomputes its target whenever a page count changes, so an unchanged target arrives often.
    if (leaf.value && sameTarget(to, leaf.value.to)) return;
    turnId += 1;
    if (sameTarget(to, shown.value) && !leaf.value) {
      shown.value = to;
      return;
    }
    if (leaf.value) {
      // A turn arrived mid-turn: finish the old one at once and start from where it was heading.
      for (const a of running) a.cancel();
      running = [];
      shown.value = leaf.value.to;
      leaf.value = null;
    }
    const from = shown.value;
    if (instant) {
      shown.value = to;
      emit("done");
      return;
    }
    if (prefersReducedMotion()) {
      shown.value = to;
      fade();
      return;
    }
    void turn(from, to);
  },
);

onBeforeUnmount(() => {
  turnId += 1;
  for (const a of running) a.cancel();
});
</script>

<template>
  <div ref="root" class="ob-pages" :data-mode="mode">
    <!-- Idle: the open spread. During a turn the base shows the two pages the leaf is not carrying. -->
    <template v-if="mode === 'spread'">
      <slot
        name="page"
        :target="leaf ? (leaf.dir === 'next' ? leaf.from : leaf.to) : shown"
        side="verso"
        :live="!leaf"
      />
      <slot
        name="page"
        :target="leaf ? (leaf.dir === 'next' ? leaf.to : leaf.from) : shown"
        side="recto"
        :live="!leaf"
      />
    </template>
    <slot
      v-else
      name="page"
      :target="leaf ? (leaf.dir === 'next' ? leaf.to : leaf.from) : shown"
      side="recto"
      :live="!leaf"
    />

    <div v-if="leaf" ref="leafEl" class="ob-leaf" :data-mode="mode" aria-hidden="true">
      <div class="ob-leaf-face" data-face="front">
        <slot name="page" :target="leaf.dir === 'next' ? leaf.from : leaf.to" side="recto" :live="false" />
        <span ref="shadeFront" class="ob-shade" />
      </div>
      <div class="ob-leaf-face" data-face="back">
        <template v-if="mode === 'spread'">
          <slot name="page" :target="leaf.dir === 'next' ? leaf.to : leaf.from" side="verso" :live="false" />
        </template>
        <section v-else class="ob-page ob-paper" data-side="verso" />
        <span ref="shadeBack" class="ob-shade" />
      </div>
    </div>
    <slot />
  </div>
</template>
