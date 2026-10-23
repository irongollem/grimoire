<template>
  <div class="flex flex-col gap-3">
    <div class="overflow-hidden rounded-lg border border-border bg-card">
      <div class="relative h-[10rem]" :style="leatherBackground(leather, '8rem')">
        <img v-if="coverImageUrl" :src="coverImageUrl" alt="" class="absolute inset-0 h-full w-full object-cover" />
        <div class="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-transparent" aria-hidden="true" />
        <div class="absolute inset-y-0 left-4 flex w-[13.5rem] flex-col justify-center gap-1.5">
          <span class="text-caption font-bold tracking-widest text-primary">AN OPEN BOOK</span>
          <span class="text-heading-sm tracking-wider text-primary">{{ title.toUpperCase() }}</span>
          <span v-if="subtitle" class="text-label-lg italic text-white/80">{{ subtitle }}</span>
          <span v-if="summary" class="text-caption text-white/60">{{ summary }}</span>
        </div>
        <img
          src="/brand/logo-dark.webp"
          alt=""
          width="960"
          height="222"
          class="absolute bottom-3 right-3 h-4 w-auto opacity-80"
          aria-hidden="true"
        />
      </div>
      <div class="flex flex-col gap-0.5 px-3.5 py-2.5">
        <span class="text-caption text-muted-foreground">{{ host }}</span>
        <span class="text-label-lg font-semibold text-foreground">{{ title }} · an Open Book</span>
        <span class="text-caption text-muted-foreground">{{ summary }}</span>
      </div>
    </div>

    <div v-if="session" class="flex flex-col gap-1.5">
      <span class="text-caption font-semibold uppercase text-muted-foreground">A shared session</span>
      <div class="overflow-hidden rounded-lg border border-border bg-card">
        <div class="relative h-[10rem]" :style="leatherBackground(leather, '8rem')">
          <img v-if="session.imageUrl" :src="session.imageUrl" alt="" class="absolute inset-0 h-full w-full object-cover" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" aria-hidden="true" />
          <div class="absolute inset-x-4 bottom-3 flex flex-col gap-1">
            <span class="text-caption font-bold tracking-widest text-primary">{{ session.kicker }}</span>
            <span class="text-heading-sm text-white">{{ session.title }}</span>
          </div>
        </div>
        <div class="flex flex-col gap-0.5 px-3.5 py-2.5">
          <span class="text-caption text-muted-foreground">{{ host }}</span>
          <span class="text-label-lg font-semibold text-foreground">{{ session.title }} · {{ title }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { OpenBookLeather, OpenBookSession, OpenBookStats } from "@/types/openBook.types";
import { leatherBackground } from "@/lib/openBook/leather";
import { shareSessionOf } from "@/lib/openBook/shareSession";

const { stats, sessions, title } = defineProps<{
  title: string;
  subtitle: string | null;
  coverImageUrl: string | null;
  leather: OpenBookLeather;
  stats: OpenBookStats | null;
  /** The book's sessions as a release made now would hold them; the newest is the example. */
  sessions: OpenBookSession[];
}>();

const host = window.location.host;
const summary = computed(() =>
  stats ? `${stats.places} places · ${stats.folk} people · ${stats.sessions} sessions` : "",
);
const session = computed(() => shareSessionOf(sessions, title));
</script>
