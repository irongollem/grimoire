<script setup lang="ts">
/**
 * A session report: "Session XIV", when it happened in the world and at the table, its title, and the story.
 * Each second-level heading in the text opens a scene, set off by a rule. The first picture in the report is the
 * article's lead plate, under the title, and is not printed again inline.
 */
import { computed } from "vue";
import type { BookModel } from "@/lib/openBook/bookModel";
import type { OpenBookSession } from "@/types/openBook.types";
import { calendarAdapterFor, formatCalendarDate, formatPlayedOn, sessionRubric, splitLeadImage } from "@/lib/openBook/articleData";
import BookRichText from "../BookRichText.vue";
import ArticlePlate from "./ArticlePlate.vue";

const { model, session } = defineProps<{ model: BookModel; session: OpenBookSession }>();

const rubric = computed(() => sessionRubric(session));
const split = computed(() => splitLeadImage(session.content));
const title = computed(() => session.session?.title || session.title);
const when = computed(() => {
  const inWorld = formatCalendarDate(session.date, calendarAdapterFor(model.snapshot.calendar));
  const played = formatPlayedOn(session.session?.played_on ?? session.real_date);
  return [inWorld, played ? `played ${played}` : null].filter((part) => part !== null).join(" · ");
});
</script>

<template>
  <article class="book-article book-session">
    <div v-if="rubric || when" class="book-session-meta">
      <span v-if="rubric" class="book-rubric">{{ rubric }}</span>
      <span v-if="when" class="book-eyebrow">{{ when }}</span>
    </div>
    <h1 class="book-title">{{ title }}</h1>
    <ArticlePlate v-if="split.leadImage" class="book-plate-lead" :src="split.leadImage.src" :alt="split.leadImage.alt ?? `Illustration for ${title}`" />
    <div v-if="session.content" class="book-prose book-dropcap"><BookRichText :content="split.docWithoutIt" :model="model" /></div>
  </article>
</template>
