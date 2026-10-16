<template>
  <AppModal :open="open && face !== null" size="sm" :label="label" :origin-key="ORIGIN_KEY" @close="emit('close')">
    <template v-if="face">
      <ModalHeader :title="STYLE_LABELS[face.style]" closeable @close="emit('close')" />
      <!-- The notice stepped up to: pinned to a patch of its board, unclamped and at reading size. -->
      <div class="nb-reader-ground" :style="groundStyle" data-reader-ground>
        <div class="nb-reader-paper">
          <div class="nb-reader-tilt" :style="{ transform: `rotate(${tilt}deg)`, '--tilt': `${tilt}deg` }">
            <NoticePinFace :face="face" mode="reader" />
          </div>
          <span class="nb-reader-tack" :data-tack="tack" aria-hidden="true">
            <img v-if="!tackFailed" :src="tackUrl(tack)" alt="" draggable="false" @error="tackFailed = true" />
          </span>
        </div>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3" data-reader-actions>
        <slot name="actions" />
      </div>
    </template>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * Leaning in on a pin. The board is for scanning and picking; reading happens up close, so a tapped pin opens here,
 * growing out of where it hung (through AppModal and motion.ts, reduced motion honoured), at full reading size with
 * its whole text, and a letter finally shows its body. The pages put what can be done with it (Take, Edit) in the
 * `#actions` slot.
 */
import { computed, ref, watch } from "vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import { rememberModalOrigin } from "@/lib/modalOrigin";
import { surfaceImageSet, tackUrl } from "@/lib/noticeBoard/art";
import { pinLabel, STYLE_LABELS } from "@/lib/noticeBoard/faces";
import { seededRotation, seededTack } from "@/lib/noticeBoard/geometry";
import type { NoticeBoardSurface, NoticePinFace as Face } from "@/types/noticeBoard.types";
import NoticePinFace from "./NoticePinFace.vue";

const ORIGIN_KEY = "notice-pin-reader";

const { open, face, origin = null, surface = "cork" } = defineProps<{
  open: boolean;
  face: Face | null;
  /** The pin element it was opened from; the reader grows out of it. */
  origin?: HTMLElement | null;
  /** The board's surface, so the patch behind the paper matches. */
  surface?: NoticeBoardSurface;
}>();
const emit = defineEmits<{ close: [] }>();

defineSlots<{ actions?: () => unknown }>();

// Recorded before the modal renders, which collects it as it opens.
watch(
  () => open,
  (isOpen) => {
    if (isOpen && origin) rememberModalOrigin(ORIGIN_KEY, origin.getBoundingClientRect());
  },
  { flush: "pre" },
);

const label = computed(() => (face ? pinLabel(face) : "Notice"));
const tilt = computed(() => (face ? seededRotation(face.id) / 2 : 0));
const tack = computed(() => (face ? seededTack(face.id, face.style) : "tack-brass"));
const tackFailed = ref(false);
const groundStyle = computed(() => ({ "--nb-ground": surfaceImageSet(surface) }));
</script>

<style scoped>
.nb-reader-ground {
  --u: min(0.065rem, calc((100vw - 4rem) / 400));
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  padding: 1.75rem 1rem 2rem;
  background-color: #b9874f;
  background-image: var(--nb-ground);
  background-size: 24rem;
  box-shadow: inset 6px 8px 10px rgb(0 0 0 / 0.35);
}
.nb-reader-paper {
  position: relative;
  height: fit-content;
  /* Lifted: the paper is close in the hand, so its shadow stands further off than on the board. */
  filter: drop-shadow(1px 1.5px 1px rgb(0 0 0 / 0.35)) drop-shadow(8px 11px 7px rgb(0 0 0 / 0.3));
}
.nb-reader-tilt {
  transform-origin: 50% calc(var(--u) * 20);
}
.nb-reader-tack {
  position: absolute;
  left: 50%;
  top: calc(var(--u) * 20);
  width: calc(var(--u) * 38);
  height: calc(var(--u) * 38);
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: #b8862b;
  filter: drop-shadow(1.5px 2px 0.5px rgb(0 0 0 / 0.55)) drop-shadow(6px 8px 1.5px rgb(0 0 0 / 0.4));
}
.nb-reader-tack[data-tack="tack-iron"],
.nb-reader-tack[data-tack="nail"] {
  background: #3b3b40;
}
.nb-reader-tack[data-tack="tack-red"] {
  background: #b3261e;
}
.nb-reader-tack[data-tack="tack-blue"] {
  background: #2b5fa8;
}
.nb-reader-tack[data-tack="tack-green"] {
  background: #3d7a3a;
}
.nb-reader-tack img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.nb-reader-tack:has(img) {
  background: none;
}
</style>
