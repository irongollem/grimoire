<script setup lang="ts">
/**
 * The cover (#1085): a leather-bound book standing on the desk. The DM chooses the leather and one of three covers:
 * tooled (gilt border, compass and title), plate (the same with their picture framed in gilt) or full (their
 * picture across the whole cover under a leather title label). A cover that asks for a picture the book does not
 * have falls back to the tooled one rather than show an empty frame. Chapter tabs stick out of the fore-edge and
 * open the book at their chapter; each ribbon the visitor has set hangs from the bottom.
 */
import { computed } from "vue";
import { RouterLink, type RouteLocationRaw } from "vue-router";
import type { OpenBookSnapshot } from "@/types/openBook.types";
import { leatherGrain, leatherStyle } from "./leather";

export interface CoverTab {
  id: string;
  label: string;
  to: RouteLocationRaw;
}

const { book, tabs, ribbonCount } = defineProps<{
  book: OpenBookSnapshot["book"];
  tabs: CoverTab[];
  ribbonCount: number;
}>();

const art = computed(() => (book.cover_art !== "tooled" && !book.cover_image_url ? "tooled" : book.cover_art));
const style = computed(() => leatherStyle(book.leather));
const grain = computed(() => leatherGrain(book.leather));
const HANG_COLOURS = ["#8a1e22", "#b8862a", "#2e5a4f"];
</script>

<template>
  <div class="ob-cover ob-leather" :data-grain="grain" :style="style">
    <div class="ob-spine" aria-hidden="true">
      <span class="ob-band" style="top: 12.5%" />
      <span class="ob-band" style="top: 35%" />
      <span class="ob-band" style="top: 62.5%" />
      <span class="ob-band" style="top: 85%" />
    </div>
    <div class="ob-edge" aria-hidden="true" />

    <template v-if="art === 'full' && book.cover_image_url">
      <div class="ob-cover-art"><img :src="book.cover_image_url" alt="" /></div>
      <div class="ob-cover-label-pos">
        <div class="ob-label ob-leather" :data-grain="grain" :style="style">
          <span class="ob-gilt vol" style="display: block; font-family: var(--ob-sans); font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.3em">VOLUME I</span>
          <h1 class="ob-cover-title ob-gilt" style="margin-top: 0.375rem">{{ book.title }}</h1>
        </div>
      </div>
      <p v-if="book.subtitle" class="ob-cover-foot">{{ book.subtitle }}</p>
    </template>

    <template v-else>
      <div class="ob-tool" aria-hidden="true">
        <span class="ob-fleuron" style="left: -5px; top: -5px" />
        <span class="ob-fleuron" style="right: -5px; top: -5px" />
        <span class="ob-fleuron" style="left: -5px; bottom: -5px" />
        <span class="ob-fleuron" style="right: -5px; bottom: -5px" />
      </div>
      <div class="ob-cover-text">
        <span v-if="art === 'tooled'" class="ob-gilt vol">VOLUME I</span>
        <h1 class="ob-cover-title ob-gilt">{{ book.title }}</h1>
        <div v-if="art === 'plate' && book.cover_image_url" class="ob-plate-frame">
          <div><img :src="book.cover_image_url" alt="" /></div>
        </div>
        <svg v-else viewBox="0 0 100 100" width="132" height="132" aria-hidden="true" style="color: #c9962e; filter: drop-shadow(0 1px 0 rgb(0 0 0 / 0.5))">
          <g fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="50" cy="50" r="40" /><circle cx="50" cy="50" r="34" /><circle cx="50" cy="50" r="6" /></g>
          <g fill="currentColor">
            <path d="M50 6 55 45 50 50 45 45Z" /><path d="M50 94 45 55 50 50 55 55Z" /><path d="M6 50 45 45 50 50 45 55Z" /><path d="M94 50 55 55 50 50 55 45Z" />
            <path d="M50 50 70 30 54 47Z" opacity=".7" /><path d="M50 50 30 70 46 53Z" opacity=".7" /><path d="M50 50 30 30 47 46Z" opacity=".7" /><path d="M50 50 70 70 53 54Z" opacity=".7" />
          </g>
        </svg>
        <p v-if="book.subtitle" class="ob-cover-sub ob-gilt">{{ book.subtitle }}</p>
      </div>
    </template>

    <span
      v-for="(_, i) in Math.min(ribbonCount, 3)"
      :key="i"
      class="ob-cover-hang"
      :style="{ left: `${29 + i * 4.75}%`, background: HANG_COLOURS[i], height: `${6.875 - i * 1.25}rem`, bottom: `${-5 + i * 1.25}rem` }"
      aria-hidden="true"
    />

    <RouterLink
      v-for="(tab, i) in tabs"
      :key="tab.id"
      :to="tab.to"
      :class="['ob-cover-tab', `ob-tab-${tab.id}`]"
      :style="{ top: `${5.5 + i * 4.625}rem` }"
      :aria-label="`Open the book at ${tab.label}`"
    >
      {{ tab.label }}
    </RouterLink>
  </div>
</template>
