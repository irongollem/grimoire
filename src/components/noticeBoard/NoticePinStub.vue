<template>
  <button
    type="button"
    class="nb-stub"
    :class="{ 'is-inert': !interactive }"
    :data-scrap="scrap"
    :aria-label="label"
    :aria-expanded="open"
    :tabindex="interactive ? 0 : -1"
    @click="emit('toggle')"
  >
    <img v-if="!failed" class="nb-scrap" :src="scrapUrl(scrap)" alt="" draggable="false" @error="failed = true" />
    <span v-else class="nb-scrap nb-scrap-flat" />
    <span v-if="open" class="nb-stub-label" role="status">{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
/**
 * What a taken notice leaves behind: the torn scrap under its tack. Tapping it says who took the notice, because a
 * player who was not watching should see what happened rather than wonder where the poster went. The tack itself
 * belongs to the pin, which keeps it through the tear-off.
 */
import { computed, ref } from "vue";
import { scrapUrl } from "@/lib/noticeBoard/art";
import { stubLabel } from "@/lib/noticeBoard/faces";
import { seededScrap } from "@/lib/noticeBoard/geometry";
import type { NoticePinFace } from "@/types/noticeBoard.types";

const { face, open = false, interactive = true } = defineProps<{
  face: NoticePinFace;
  /** Whether the "Taken by ..." line is showing. */
  open?: boolean;
  /** Off while the tear-off plays above it. */
  interactive?: boolean;
}>();
const emit = defineEmits<{ toggle: [] }>();

const failed = ref(false);
const scrap = computed(() => seededScrap(face.id, face.style));
const label = computed(() => stubLabel(face));
</script>

<style scoped>
.nb-stub {
  position: absolute;
  left: 50%;
  top: calc(var(--u) * 20);
  width: calc(var(--u) * 170);
  transform: translate(-50%, -32%);
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  /* Flat paper: contact and cast only, no pin-height lift. */
  filter: drop-shadow(calc(var(--u) * 1) calc(var(--u) * 1.5) calc(var(--u) * 0.6) rgb(0 0 0 / 0.35))
    drop-shadow(calc(var(--u) * 5) calc(var(--u) * 7) calc(var(--u) * 3) rgb(0 0 0 / 0.28));
}
.nb-stub.is-inert {
  pointer-events: none;
}
.nb-scrap {
  display: block;
  width: 100%;
  height: auto;
}
.nb-scrap-flat {
  height: calc(var(--u) * 130);
  background: #e9dcc0;
  clip-path: polygon(4% 8%, 96% 0, 100% 90%, 8% 100%);
}
.nb-stub-label {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: calc(var(--u) * 6);
  padding: calc(var(--u) * 8) calc(var(--u) * 16);
  white-space: nowrap;
  font-family: "Fondamento", "Alegreya", Georgia, serif;
  font-size: calc(var(--u) * 28);
  color: #2b2019;
  background: #faf6ee;
  border: calc(var(--u) * 1.5) solid rgb(43 32 25 / 0.35);
}
</style>
