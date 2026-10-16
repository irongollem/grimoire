<template>
  <div class="nb-board" data-board :data-surface="surface">
    <!-- The stage is the container's child so `cqw` resolves against the board: one unit is 1/1600 of its width. -->
    <div class="nb-stage" :style="stageStyle">
      <!-- The frame's shade falls on the surface, under the pins. -->
      <div class="nb-rails" aria-hidden="true" />
      <NoticeBoardScatter v-if="scatter.length" :pieces="scatter" />
      <div class="nb-pins"><slot /></div>
      <div class="nb-frame" aria-hidden="true" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The framed cork or timber that pins hang on. It owns no layout of its own: it is a 3:2 size container, and
 * everything inside is sized in board units (`--u`), so text stays crisp at any size and the DM's arrangement is the
 * same on every device. It is a physical object and looks the same in every theme.
 *
 * Give it a width and it takes the height from the 3:2 ratio. Never scale it with a transform, which blurs the type.
 */
import { computed } from "vue";
import { cssUrl, FRAME_SCALE, FRAMES, frameUrl, surfaceImageSet } from "@/lib/noticeBoard/art";
import type { NoticeBoardSurface, NoticeScatterPiece } from "@/types/noticeBoard.types";
import NoticeBoardScatter from "./NoticeBoardScatter.vue";

const { surface, scatter = [] } = defineProps<{
  surface: NoticeBoardSurface;
  /** The leftover tacks and scraps behind the pins; a board nobody scattered has none. */
  scatter?: readonly NoticeScatterPiece[];
}>();

const stageStyle = computed(() => {
  const { slice } = FRAMES[surface];
  const unit = (n: number) => `calc(var(--u) * ${Math.round(n * FRAME_SCALE * 100) / 100})`;
  return {
    "--nb-surface": surfaceImageSet(surface),
    "--nb-frame": cssUrl(frameUrl(surface)),
    "--nb-slice": `${slice.top} ${slice.right} ${slice.bottom} ${slice.left}`,
    "--nb-rail-t": unit(slice.top),
    "--nb-rail-r": unit(slice.right),
    "--nb-rail-b": unit(slice.bottom),
    "--nb-rail-l": unit(slice.left),
  };
});
</script>

<style scoped>
.nb-board {
  /* Hung on the page, lit from the top left like everything on it: a tight contact shade and a soft cast one. */
  box-shadow:
    0.0625rem 0.125rem 0.1875rem rgb(0 0 0 / 0.35),
    0.5rem 0.75rem 1.25rem rgb(0 0 0 / 0.28);
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 2;
  container-type: size;
  user-select: none;
  -webkit-user-select: none;
}
.nb-stage {
  --u: calc(100cqw / 1600);
  position: absolute;
  inset: 0;
  /* Placeholder first: a flat cork colour and a solid wood border stand in until the art arrives. */
  background-color: #b9874f;
  background-image: var(--nb-surface);
  /* Repeats at half the board's width, so it tiles exactly twice across at any size. */
  background-size: calc(var(--u) * 800);
}
.nb-pins {
  position: absolute;
  inset: 0;
}
.nb-rails {
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* One light, top left: only the top and left rails stand over the surface. 9,12,9 at .35, inset. */
  box-shadow: inset calc(var(--u) * 9) calc(var(--u) * 12) calc(var(--u) * 9) rgb(0 0 0 / 0.35);
  /* Clipped to inside the frame, so the shadow starts at the rail's inner edge rather than the board's. */
  clip-path: inset(var(--nb-rail-t) 0 0 var(--nb-rail-l));
}
.nb-frame {
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-sizing: border-box;
  border-style: solid;
  border-color: #5b3a1e;
  border-width: var(--nb-rail-t) var(--nb-rail-r) var(--nb-rail-b) var(--nb-rail-l);
  border-image-source: var(--nb-frame);
  border-image-slice: var(--nb-slice);
  border-image-width: var(--nb-rail-t) var(--nb-rail-r) var(--nb-rail-b) var(--nb-rail-l);
  border-image-repeat: stretch;
}
</style>
