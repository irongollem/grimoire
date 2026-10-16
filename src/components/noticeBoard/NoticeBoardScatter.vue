<template>
  <div class="nb-scatter" aria-hidden="true" data-scatter>
    <!-- The shadow sits on an unrotated wrapper and the tilt on its child, so every piece is lit from the same side. -->
    <div
      v-for="(piece, i) in drawn"
      :key="i"
      class="nb-scatter-piece"
      :class="piece.scrap ? 'is-scrap' : 'is-tack'"
      :style="{ left: `${piece.x * 100}%`, top: `${piece.y * 100}%` }"
    >
      <div class="nb-scatter-tilt" :style="{ transform: `rotate(${piece.r}deg)` }">
        <img class="nb-scatter-art" :src="piece.src" alt="" draggable="false" @error="hide" />
        <img v-if="piece.tackSrc" class="nb-scatter-tack" :src="piece.tackSrc" alt="" draggable="false" @error="hide" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The leftover tacks and torn scraps behind a board's pins (src/lib/noticeBoard/scatter.ts). Decoration only: hidden
 * from assistive tech and never in the way of a tap. The rows are jsonb, so a piece naming art this build does not
 * have is skipped rather than drawn as a broken image.
 */
import { computed } from "vue";
import { scrapUrl, tackUrl } from "@/lib/noticeBoard/art";
import { POSTER_SCRAPS, SCRAPS, TACKS, type ScrapName, type TackName } from "@/lib/noticeBoard/geometry";
import type { NoticeScatterPiece } from "@/types/noticeBoard.types";

const { pieces } = defineProps<{ pieces: readonly NoticeScatterPiece[] }>();

const SCRAP_ART = new Set<string>([...SCRAPS, ...POSTER_SCRAPS]);
const TACK_ART = new Set<string>([...TACKS, "nail"]);
const isScrap = (art: string): art is ScrapName => SCRAP_ART.has(art);
const isTack = (art: string | null): art is TackName => art !== null && TACK_ART.has(art);

const drawn = computed(() =>
  pieces.flatMap((piece) => {
    if (isScrap(piece.art)) {
      return [{ ...piece, scrap: true, src: scrapUrl(piece.art), tackSrc: isTack(piece.tack) ? tackUrl(piece.tack) : null }];
    }
    if (isTack(piece.art)) return [{ ...piece, scrap: false, src: tackUrl(piece.art), tackSrc: null }];
    return [];
  }),
);

/** A missing image is clutter nobody needs; it simply is not there. */
function hide(event: Event) {
  (event.target as HTMLElement).style.visibility = "hidden";
}
</script>

<style scoped>
.nb-scatter {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.nb-scatter-piece {
  position: absolute;
  transform: translate(-50%, -50%);
}
/* Flat paper: contact and cast, as a taken notice's stub. */
.nb-scatter-piece.is-scrap {
  width: calc(var(--u) * 130);
  filter: drop-shadow(calc(var(--u) * 1) calc(var(--u) * 1.5) calc(var(--u) * 0.6) rgb(0 0 0 / 0.35))
    drop-shadow(calc(var(--u) * 5) calc(var(--u) * 7) calc(var(--u) * 3) rgb(0 0 0 / 0.28));
}
/* A tack is the highest thing on a board, so it casts the longest shadow. */
.nb-scatter-piece.is-tack {
  width: calc(var(--u) * 30);
  filter: drop-shadow(calc(var(--u) * 1.5) calc(var(--u) * 2) calc(var(--u) * 0.5) rgb(0 0 0 / 0.55))
    drop-shadow(calc(var(--u) * 6) calc(var(--u) * 8) calc(var(--u) * 1.25) rgb(0 0 0 / 0.4));
}
.nb-scatter-tilt {
  position: relative;
}
.nb-scatter-art {
  display: block;
  width: 100%;
  height: auto;
}
/* The tack still holding a scrap, near its top edge, where the notice hung from it. */
.nb-scatter-tack {
  position: absolute;
  left: 50%;
  top: 18%;
  width: calc(var(--u) * 30);
  transform: translate(-50%, -50%);
}
</style>
