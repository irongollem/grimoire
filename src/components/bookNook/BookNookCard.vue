<template>
  <div
    class="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/50"
    data-testid="nook-card"
    @pointerenter="active = true"
    @pointerleave="active = false"
    @focusin="active = true"
    @focusout="active = false"
  >
    <!-- Whole-card link, behind the menu. -->
    <RouterLink :to="`/book-nook/${nook.id}`" class="absolute inset-0 z-2" :aria-label="`Open ${nook.title}`" />

    <!-- The still is the card; the nook is mounted only while the pointer or focus is on it, so a page of nooks costs nothing until looked at. -->
    <div class="relative aspect-video shrink-0 overflow-hidden bg-muted">
      <BookNookPlayer v-if="active" :scene="nook.scene" :still="nook.still_url" screen="wide" />
      <img
        v-else-if="nook.still_url"
        :src="nook.still_url"
        :alt="nook.title"
        loading="lazy"
        class="size-full object-cover"
      />
      <div v-else class="flex size-full items-center justify-center text-muted-foreground">
        <IconImages class="h-8 w-8" />
      </div>
    </div>

    <div class="flex items-start gap-2 p-3">
      <div class="min-w-0 flex-1">
        <h3 class="truncate text-heading-sm font-bold text-foreground">{{ nook.title }}</h3>
        <p class="mt-0.5 flex items-center gap-1.5 text-caption text-muted-foreground">
          <IconCompassRose class="h-3 w-3 shrink-0" />
          <span class="truncate">{{ placeName ? `Shown at ${placeName}` : "Not shown at a place" }}</span>
        </p>
      </div>
      <div class="relative z-3 shrink-0">
        <OverflowMenu :label="`More actions for ${nook.title}`" :items="MENU" @select="onSelect" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { RouterLink } from "vue-router";
import BookNookPlayer from "@/components/bookNook/BookNookPlayer.vue";
import OverflowMenu from "@/components/common/overlays/OverflowMenu.vue";
import type { OverflowMenuEntry } from "@/components/common/overlays/OverflowMenu.vue";
import { useDeleteBookNook } from "@/composables/bookNook/useBookNooks";
import { useConfirm } from "@/composables/useConfirm";
import { IconCompassRose, IconImages } from "@/lib/icons";
import type { BookNook } from "@/types/bookNook.types";

const { nook, placeName } = defineProps<{
  nook: BookNook;
  /** The place that shows this nook, or null when none does. */
  placeName: string | null;
}>();

const MENU: readonly OverflowMenuEntry[] = [{ key: "delete", label: "Delete", danger: true }];

const active = ref(false);
const { confirm } = useConfirm();
const { mutateAsync: deleteNook } = useDeleteBookNook();

async function onSelect(key: string) {
  if (key !== "delete") return;
  const where = placeName ? ` It stops being shown at ${placeName}.` : "";
  const ok = await confirm(`Delete "${nook.title}"?${where}`, { title: "Delete nook", confirmLabel: "Delete" });
  if (ok) await deleteNook(nook.id);
}
</script>
