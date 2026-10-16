<template>
  <div
    class="nb-face"
    :class="[`is-${face.style}`, `is-${mode}`, `is-size-${face.size}`]"
    :data-style="face.style"
    :data-mode="mode"
    :style="paperVars"
  >
    <template v-if="face.style === 'poster'">
      <p class="nb-wanted">Wanted</p>
      <div v-if="face.image_url" class="nb-portrait">
        <FocalImage :src="face.image_url" format="square" :focal-point="CENTRED" />
      </div>
      <p v-if="face.headline" class="nb-poster-name">{{ face.headline }}</p>
      <p v-if="face.body" class="nb-poster-body">{{ face.body }}</p>
      <p v-if="face.reward" class="nb-reward">Reward: {{ face.reward }}</p>
    </template>

    <template v-else-if="face.style === 'letter'">
      <p v-if="face.headline" class="nb-hand nb-address">{{ face.headline }}</p>
      <span v-if="face.seal" class="nb-seal" :data-seal="face.seal">
        <img v-if="!sealFailed" :src="sealUrl(face.seal)" alt="" draggable="false" @error="sealFailed = true" />
      </span>
      <!-- Sealed on the board; the body is what the reader breaks the seal for. -->
      <p v-if="mode === 'reader' && face.body" class="nb-hand nb-body">{{ face.body }}</p>
    </template>

    <template v-else-if="face.style === 'image'">
      <div v-if="face.image_url" class="nb-picture">
        <FocalImage :src="face.image_url" format="landscape" :focal-point="CENTRED" />
      </div>
      <p v-if="face.headline" class="nb-hand nb-caption">{{ face.headline }}</p>
      <p v-if="mode === 'reader' && face.body" class="nb-hand nb-body">{{ face.body }}</p>
    </template>

    <template v-else>
      <p v-if="face.headline" class="nb-hand nb-headline">{{ face.headline }}</p>
      <p v-if="face.body" class="nb-hand nb-body">{{ face.body }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * The four faces of a pinned notice, as live text over a paper: a note in the DM's hand, a wanted poster in print, a
 * sealed letter, a picture. Nothing here is baked into art, so it stays sharp at every zoom and screen readers read it.
 *
 * Sized entirely in board units (`--u`), which the board stage sets from its own width. The reader sets `--u` itself
 * so the same face can be read up close, larger and unclamped. The board is lit the same in every theme, so the ink
 * and paper colours here are fixed on purpose and ignore the theme tokens.
 */
import { computed, ref } from "vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { cssUrl, edgeFor, paperUrl, sealUrl, surfaceImageSet } from "@/lib/noticeBoard/art";
import type { NoticePinFace } from "@/types/noticeBoard.types";

const { face, mode = "board" } = defineProps<{
  face: NoticePinFace;
  mode?: "board" | "reader";
}>();

const sealFailed = ref(false);
// Pins have no focal point column, so a picture (an upload, or a portrait copied from an NPC or monster) is framed from its centre.
const CENTRED = { x: 50, y: 50 };

const paperVars = computed(() => ({
  "--nb-edge": edgeFor(face.style),
  "--nb-paper": cssUrl(paperUrl()),
  "--nb-poster-paper": surfaceImageSet("poster-paper"),
}));
</script>

<style scoped>
.nb-face {
  --nb-ink: #2b2019;
  --nb-fs-head: 34;
  --nb-fs-body: 26;
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: var(--nb-ink);
  /* The torn edge outsets past the box (vellum's slip); the 2u border keeps the paper texture clear of its ragged line. */
  border: calc(var(--u) * 2) solid transparent;
  border-image: var(--nb-edge) 12 fill / calc(var(--u) * 12) / calc(var(--u) * 7) round;
  background-color: #faf6ee;
  background-image: var(--nb-paper);
  background-size: calc(var(--u) * 360);
  background-clip: padding-box;
  padding: calc(var(--u) * 36) calc(var(--u) * 24) calc(var(--u) * 22);
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 8);
  text-align: left;
}
.nb-face.is-poster {
  background-color: #e6d3a1;
  background-image: var(--nb-poster-paper);
  background-size: calc(var(--u) * 256);
  text-align: center;
  align-items: stretch;
  gap: calc(var(--u) * 6);
}
.nb-face.is-reader {
  /* 400 units across at about 26rem; narrower screens shrink it to fit with a gutter either side. */
  --u: min(0.065rem, calc((100vw - 4rem) / 400));
  --nb-fs-head: 32;
  --nb-fs-body: 21;
  width: calc(var(--u) * 400);
  height: auto;
  min-height: calc(var(--u) * 300);
  overflow: visible;
  padding: calc(var(--u) * 44) calc(var(--u) * 34) calc(var(--u) * 34);
}
.nb-face.is-reader.is-poster {
  min-height: calc(var(--u) * 530);
}
.nb-hand {
  font-family: "Fondamento", "Alegreya", Georgia, serif;
  font-weight: 400;
  margin: 0;
  overflow-wrap: anywhere;
}
.nb-headline {
  font-size: calc(var(--u) * var(--nb-fs-head));
  line-height: 1.15;
}
.nb-body {
  font-size: calc(var(--u) * var(--nb-fs-body));
  line-height: 1.32;
  white-space: pre-line;
}
/*
 * On the board a pin is a fixed piece of paper, and how much room is left for the body depends on how long the
 * headline runs. So the short lines are clamped and never shrink (a flex item that shrinks is cut through the middle
 * of a line), and the body takes what is left and fades out at the bottom like writing running off the paper. The
 * fade only ever covers the body's last line of room: text that ends sooner is untouched. The reader shows it all.
 */
.is-board .nb-headline,
.is-board .nb-caption,
.is-board .nb-poster-name,
.is-board .nb-poster-body,
.is-board .nb-reward,
.is-board .nb-address {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  flex: none;
}
.is-board .nb-body {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  mask-image: linear-gradient(to bottom, #000 calc(100% - 1.1em), transparent);
}
.is-board.is-size-sm {
  --nb-fs-head: 28;
  --nb-fs-body: 22;
}

/* Poster */
.nb-wanted,
.nb-poster-name,
.nb-poster-body,
.nb-reward {
  margin: 0;
  font-family: "Alegreya", Georgia, serif;
}
.nb-wanted {
  font-size: calc(var(--u) * 50);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-shadow: 0 0 calc(var(--u) * 1.5) rgb(43 32 25 / 0.5);
}
.nb-portrait {
  flex: 1 1 0;
  min-height: calc(var(--u) * 40);
  align-self: center;
  width: 62%;
  border: calc(var(--u) * 4) solid var(--nb-ink);
  outline: calc(var(--u) * 1.5) solid rgb(43 32 25 / 0.5);
  outline-offset: calc(var(--u) * 2);
  background: #cdb98a;
}
.is-reader .nb-portrait {
  flex: none;
  aspect-ratio: 1;
}
/* FocalImage fits the picture itself (cover, or a clipped tall image shifted to its focus), so only the tint is ours:
   forcing a height here fights its clipped mode and leaves a gap under the picture. The frames clip the overflow. */
.nb-portrait,
.nb-picture {
  overflow: hidden;
}
.nb-portrait :deep(img),
.nb-picture :deep(img) {
  filter: sepia(0.35) contrast(1.05);
  /* The pin is dragged by pointer; the browser's own image drag would take the tap. */
  -webkit-user-drag: none;
  user-select: none;
}
.nb-poster-name {
  font-size: calc(var(--u) * 32);
  font-weight: 700;
  line-height: 1.1;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.nb-poster-body {
  font-size: calc(var(--u) * 22);
  line-height: 1.25;
}
.is-reader .nb-poster-body {
  font-size: calc(var(--u) * 24);
}
.is-board .nb-poster-body {
  -webkit-line-clamp: 2;
}
.nb-reward {
  font-size: calc(var(--u) * 24);
  font-weight: 700;
  line-height: 1.2;
}
.is-board .nb-reward {
  -webkit-line-clamp: 2;
}

/* Letter */
.nb-face.is-letter {
  align-items: center;
  text-align: center;
  justify-content: center;
  /* The folded flap: a faint crease from each upper corner down to the seal. */
  background-image:
    linear-gradient(to bottom right, transparent calc(50% - 1px), rgb(90 60 30 / 0.16) 50%, transparent calc(50% + 1px)),
    linear-gradient(to bottom left, transparent calc(50% - 1px), rgb(90 60 30 / 0.16) 50%, transparent calc(50% + 1px)),
    var(--nb-paper);
  background-size: 100% 70%, 100% 70%, calc(var(--u) * 360);
  background-repeat: no-repeat, no-repeat, repeat;
}
.nb-face.is-letter.is-reader {
  background-image: var(--nb-paper);
  background-size: calc(var(--u) * 360);
  background-repeat: repeat;
}
.nb-address {
  font-size: calc(var(--u) * 30);
  line-height: 1.15;
  order: 2;
}
.nb-seal {
  order: 1;
  position: relative;
  flex: none;
  width: calc(var(--u) * 84);
  height: calc(var(--u) * 84);
  border-radius: 50%;
  background: #8c1d18;
  /* The face is tilted; the seal's offsets are turned back against it so the light stays top-left (--tilt is set by the pin). */
  filter: drop-shadow(
      calc(var(--u) * (1.5 * cos(var(--tilt, 0deg)) + 2 * sin(var(--tilt, 0deg))))
        calc(var(--u) * (2 * cos(var(--tilt, 0deg)) - 1.5 * sin(var(--tilt, 0deg)))) calc(var(--u) * 1.5) rgb(0 0 0 / 0.45)
    )
    drop-shadow(
      calc(var(--u) * (5 * cos(var(--tilt, 0deg)) + 6 * sin(var(--tilt, 0deg))))
        calc(var(--u) * (6 * cos(var(--tilt, 0deg)) - 5 * sin(var(--tilt, 0deg)))) calc(var(--u) * 4) rgb(0 0 0 / 0.3)
    );
}
.nb-seal[data-seal="black"] {
  background: #1d1a1a;
}
.nb-seal img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 50%;
}
/* On the board the seal and the address share a short folded letter; a small one keeps to a single line. */
.is-letter.is-board .nb-seal {
  width: calc(var(--u) * 64);
  height: calc(var(--u) * 64);
}
.is-letter.is-board .nb-address {
  font-size: calc(var(--u) * 26);
}
.is-letter.is-board.is-size-sm .nb-seal {
  width: calc(var(--u) * 48);
  height: calc(var(--u) * 48);
}
.is-letter.is-board.is-size-sm .nb-address {
  font-size: calc(var(--u) * 22);
  -webkit-line-clamp: 1;
}
.is-letter.is-reader .nb-seal {
  width: calc(var(--u) * 70);
  height: calc(var(--u) * 70);
}
.is-letter.is-reader .nb-address {
  font-size: calc(var(--u) * 34);
}
.is-letter.is-reader .nb-body {
  order: 3;
  text-align: left;
  margin-top: calc(var(--u) * 14);
  align-self: stretch;
}

/* Picture */
.nb-face.is-image {
  padding: calc(var(--u) * 34) calc(var(--u) * 20) calc(var(--u) * 18);
}
.nb-picture {
  flex: 1 1 0;
  min-height: calc(var(--u) * 40);
  border: calc(var(--u) * 1.5) solid rgb(43 32 25 / 0.35);
  background: #d8cbb0;
}
.is-reader .nb-picture {
  flex: none;
  aspect-ratio: 4 / 3;
}
.nb-caption {
  font-size: calc(var(--u) * 28);
  line-height: 1.15;
  text-align: center;
}
.is-reader .nb-caption {
  font-size: calc(var(--u) * 30);
}
</style>
