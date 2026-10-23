<script setup lang="ts">
/** A place in the Atlas: the map plate, the kind line, the title, the player summary as a lede, the description. */
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import type { BookModel } from "@/lib/openBook/bookModel";
import type { OpenBookPlace } from "@/types/openBook.types";
import { placePlate, placeTypeLabel, readPins } from "@/lib/openBook/articleData";
import BookRichText from "../BookRichText.vue";
import ArticlePlate from "./ArticlePlate.vue";
import ArticleRefList from "./ArticleRefList.vue";

const { model, place } = defineProps<{ model: BookModel; place: OpenBookPlace }>();

const route = useRoute();
const plate = computed(() => placePlate(place));
const pins = computed(() => (plate.value?.isMap ? readPins(place.pins) : []));
const kind = computed(() => {
  const where = model.ancestorsOf(place.id).at(-1)?.name ?? null;
  return [placeTypeLabel(place.location_type), where].filter((part) => part !== null).join(" · ");
});
const within = computed(() => model.childrenOf(place.id).map((p) => ({ id: p.id, note: placeTypeLabel(p.location_type) })));
const folk = computed(() => model.peopleAt(place.id).map((p) => ({ id: p.id, label: p.name, note: p.occupation })));

function pinTarget(childId: string) {
  const entry = model.byId.get(childId);
  if (!entry) return null;
  const raw = route.params.slug;
  return { name: "open-book-entry", params: { slug: Array.isArray(raw) ? raw[0] : raw, chapter: entry.chapter, entryId: entry.id } };
}
</script>

<template>
  <article class="book-article book-place">
    <ArticlePlate :src="plate?.url ?? null" :alt="`Map of ${place.name}`">
      <template v-for="pin in pins" :key="pin.childId">
        <RouterLink
          v-if="pinTarget(pin.childId)"
          class="book-pin"
          :style="{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }"
          :to="pinTarget(pin.childId)!"
          :aria-label="pin.name"
          :title="pin.name"
        />
        <span
          v-else
          class="book-pin book-pin-plain"
          :style="{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }"
          :title="pin.name"
        />
      </template>
    </ArticlePlate>
    <header class="book-head">
      <svg class="book-compass" viewBox="0 0 100 100" aria-hidden="true">
        <g fill="currentColor"><path d="M50 6 55 45 50 50 45 45Z" /><path d="M50 94 45 55 50 50 55 55Z" /><path d="M6 50 45 45 50 50 45 55Z" /><path d="M94 50 55 55 50 50 55 45Z" /></g>
        <circle cx="50" cy="50" r="36" fill="none" stroke="currentColor" stroke-width="3" />
      </svg>
      <div class="book-head-text">
        <span v-if="kind" class="book-eyebrow">{{ kind }}</span>
        <h1 class="book-title">{{ place.name }}</h1>
      </div>
    </header>
    <p v-if="place.player_summary" class="book-lede">{{ place.player_summary }}</p>
    <div v-if="place.description" class="book-prose book-dropcap"><BookRichText :content="place.description" :model="model" /></div>
    <div class="book-refs-grid">
      <ArticleRefList :model="model" title="Places within" :items="within" />
      <ArticleRefList :model="model" title="Folk met here" :items="folk" />
    </div>
  </article>
</template>
