<template>
  <Teleport to="body">
    <Transition :css="false" @enter="onEnter" @leave="onLeave">
      <div
        v-if="isOpen"
        ref="overlayRef"
        class="fixed inset-0 z-200 bg-black cursor-zoom-out focus:outline-none"
        role="dialog"
        aria-modal="true"
        :aria-label="scene.title"
        tabindex="-1"
        data-testid="nook-fullscreen"
        @click="close"
        @keydown.tab="onTab"
      >
        <div data-nook-stage class="absolute inset-0">
          <BookNookPlayer :scene="scene" :still="still" :screen="screenKind" fullscreen :tilt="tilt" />
        </div>
        <!-- The catalogued scrim, as ImageLightbox's close: a lone control floating over a picture. -->
        <AppButton
          variant="ghost"
          size="icon-sm"
          :class="[CARD_OVERLAY_SCRIM, 'absolute top-4 right-4 rounded-full text-white/80 hover:text-white']"
          :icon="IconClose"
          aria-label="Close"
          @click.stop="close"
        />
        <p class="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 px-4 pb-6 text-center text-white/80">
          <span class="text-eyebrow">{{ scene.title }}</span>
          <span class="text-caption text-white/60">Tap to close</span>
        </p>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * A nook full screen: black ground, the picture with its ornamental frame, and the viewer looking round the
 * room by tilting the phone (coarse pointer) or moving the pointer (fine). The TV has no tilt: it breathes.
 *
 * THE CALLER MUST CALL `open()` SYNCHRONOUSLY INSIDE ITS OWN CLICK HANDLER. Opening is the tap a browser
 * requires before it lets a page ask for motion: on an iPhone `open()` raises the one-time motion prompt
 * right there (`useDeviceTilt.start()`), and an `await` or a `nextTick` before it forfeits the gesture and
 * the prompt is refused. A refusal, Android, and reduced motion all leave the picture breathing as before.
 * Leaving full screen stops the sensors. Pass the thumbnail's rect to `open()` to have the picture fly out of
 * it (as ImageLightbox does); without one it fades.
 */
import { computed, effectScope, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { CARD_OVERLAY_SCRIM } from "@/components/common/controls/appButtonVariants";
import { trapTab } from "@/components/common/overlays/focusTrap";
import { useDeviceTilt, usePointerTilt } from "@/composables/bookNook/useDeviceTilt";
import { useHotkeys } from "@/composables/useHotkeys";
import type { Scene } from "@/lib/bookNook/scene";
import { IconClose } from "@/lib/icons";
import type { ModalOrigin } from "@/lib/modalOrigin";
import { canAnimate, originTransform, prefersReducedMotion, REST_TRANSFORM, whenSettled } from "@/lib/motion";
import BookNookPlayer from "./BookNookPlayer.vue";

defineProps<{ scene: Scene; still?: string | null }>();
const emit = defineEmits<{ close: [] }>();

const isOpen = ref(false);
const overlayRef = ref<HTMLElement | null>(null);

// ── What the screen is ───────────────────────────────────────────────────────

const portrait = ref(false);
const coarse = ref(false);
const screenKind = computed<"wide" | "tall">(() => (portrait.value ? "tall" : "wide"));

let queries: { query: MediaQueryList; onChange: () => void }[] = [];
function track(text: string, into: (matches: boolean) => void) {
  if (typeof matchMedia === "undefined") return;
  const query = matchMedia(text);
  const onChange = () => into(query.matches);
  onChange();
  query.addEventListener?.("change", onChange);
  queries.push({ query, onChange });
}
onMounted(() => {
  track("(orientation: portrait)", (m) => (portrait.value = m));
  track("(pointer: coarse)", (m) => (coarse.value = m));
});
onBeforeUnmount(() => {
  for (const { query, onChange } of queries) query.removeEventListener?.("change", onChange);
  queries = [];
});

// ── Looking round ────────────────────────────────────────────────────────────

const device = useDeviceTilt();
const pointer = usePointerTilt(overlayRef);
const tilt = computed(() => (coarse.value ? device.tilt.value : pointer.tilt.value));

// ── Open and close ───────────────────────────────────────────────────────────

let origin: ModalOrigin | null = null;
let opener: HTMLElement | null = null;

/** Opens full screen. Call it synchronously from a click handler (see the header). */
function open(from?: ModalOrigin) {
  if (isOpen.value) return;
  // First, and before anything is awaited: this is the gesture iOS needs for the motion prompt.
  if (coarse.value) device.start();
  origin = from ?? null;
  opener = (document.activeElement as HTMLElement | null) ?? null;
  isOpen.value = true;
  void nextTick(() => overlayRef.value?.focus());
}

function close() {
  if (!isOpen.value) return;
  device.stop();
  isOpen.value = false;
  emit("close");
  opener?.focus?.();
  opener = null;
}

defineExpose({ open, close });

function onTab(event: KeyboardEvent) {
  trapTab(event, overlayRef.value);
}

watch(
  isOpen,
  (now, _was, onCleanup) => {
    if (!now) return;
    const scope = effectScope();
    scope.run(() => {
      useHotkeys(
        () => [{ combo: "escape", description: "Close picture", hidden: true, allowInTextEntry: true, handler: close }],
        { layer: "overlay" },
      );
    });
    onCleanup(() => scope.stop());
  },
  { flush: "sync" },
);

onBeforeUnmount(() => device.stop());

// ── Animation ────────────────────────────────────────────────────────────────

const FADE_MS = 180;
const FLIGHT_MS = 380;

function onEnter(el: Element, done: () => void) {
  if (!canAnimate(el) || prefersReducedMotion()) return done();
  const fade = el.animate({ opacity: [0, 1] }, { duration: FADE_MS, easing: "ease-out" });
  const stage = el.querySelector<HTMLElement>("[data-nook-stage]");
  const to = stage?.getBoundingClientRect();
  if (origin && stage && to && to.width > 0 && to.height > 0) {
    const flight = stage.animate(
      { transform: [originTransform(origin, to), REST_TRANSFORM] },
      { duration: FLIGHT_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    whenSettled([fade, flight], done);
  } else whenSettled(fade, done);
}

function onLeave(el: Element, done: () => void) {
  if (!canAnimate(el) || prefersReducedMotion()) return done();
  whenSettled(el.animate({ opacity: [1, 0] }, { duration: FADE_MS, easing: "ease-in" }), done);
}
</script>
