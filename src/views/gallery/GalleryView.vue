<template>
  <PageHeader title="Gallery" description="Every image you've conjured, gathered in one place.">
    <template #title-suffix>
      <ManualHelpLink page="gallery" />
    </template>

    <template #header-extra>
      <div class="flex flex-col gap-2">
        <!-- Search + Clear -->
        <div class="flex items-center gap-2">
          <div class="relative flex-1 max-w-xs">
            <IconSearch class="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              v-model="search"
              type="text"
              placeholder="Search prompts…"
              class="w-full rounded-md border border-border bg-background pl-7 pr-2 py-1.5 font-fell text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <button
            v-if="hasActiveFilters"
            type="button"
            class="px-2.5 py-1.5 text-label-lg font-semibold text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
            @click="resetGalleryFilters"
          >Clear</button>
        </div>

        <!-- Kind tabs -->
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-cinzel text-xs tracking-wide transition-colors"
            :class="activeKind === tab.key
              ? 'border-primary bg-primary/10 text-primary font-semibold'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/50'"
            @click="activeKind = tab.key"
          >
            {{ tab.label }}
            <span class="font-fell text-2xs opacity-60">{{ tab.count }}</span>
          </button>
        </div>
      </div>
    </template>

    <div v-if="isPending" class="flex justify-center py-16">
      <LoadingSpinner message="Gathering your gallery…" />
    </div>

    <EmptyState
      v-else-if="filtered.length === 0"
      :title="images.length === 0 ? 'No generations yet' : 'Nothing matches'"
      :description="images.length === 0
        ? 'Art you generate for NPCs, monsters, scenes, maps and more will collect here automatically.'
        : 'Try a different tab or clear your search.'"
    >
      <template #icon><IconNavGallery class="h-12 w-12 opacity-40" /></template>
    </EmptyState>

    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 pt-1">
      <div
        v-for="img in filtered"
        :key="img.id"
        class="group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted"
      >
        <FocalImage
          :src="img.image_url"
          :alt="img.prompt"
          format="square"
          :render-width="300"
          lightbox
          class="h-full w-full"
        />

        <!-- Kind badge -->
        <span class="absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-label bg-black/60 text-white pointer-events-none">
          {{ kindLabel(img.kind) }}
        </span>

        <!-- Actions -->
        <div class="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            v-if="navTarget(img)"
            type="button"
            title="Open source"
            class="p-1 rounded bg-black/60 text-white hover:bg-primary"
            @click.stop="goToEntity(img)"
          ><IconExternalLink class="h-3.5 w-3.5" /></button>
          <button
            type="button"
            title="Remove from gallery"
            class="p-1 rounded bg-black/60 text-white hover:bg-destructive"
            @click.stop="onDelete(img)"
          ><IconDelete class="h-3.5 w-3.5" /></button>
        </div>

        <!-- Prompt + date -->
        <div class="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent px-2 pt-6 pb-1.5 pointer-events-none">
          <p class="font-fell text-2xs text-white/90 line-clamp-2 leading-tight">{{ img.prompt || '—' }}</p>
          <p class="font-fell text-2xs text-white/50">{{ timeAgo(img.created_at) }}</p>
        </div>
      </div>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import PageHeader from "@/components/common/PageHeader.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import { IconNavGallery, IconSearch, IconExternalLink, IconDelete } from "@/lib/icons";
import { useUiStore } from "@/stores/ui";
import { useConfirm } from "@/composables/useConfirm";
import { timeAgo } from "@/lib/utils";
import { useGalleryImages, useDeleteGalleryImage, type GalleryImage } from "@/composables/useGalleryImages";
import { KIND_META, IMAGE_GEN_KINDS, type ImageGenKind } from "@/composables/useImageGenerationLog";

const router = useRouter();
const { confirm } = useConfirm();
const ui = useUiStore();
const { galleryActiveKind, gallerySearch, galleryHasActiveFilters } = storeToRefs(ui);

const { query, images, countsByKind } = useGalleryImages();
const isPending = query.isPending;
const { mutateAsync: deleteImage } = useDeleteGalleryImage();

const activeKind = computed({
  get: () => galleryActiveKind.value,
  set: (v) => { galleryActiveKind.value = v; },
});
const search = computed({
  get: () => gallerySearch.value,
  set: (v) => { gallerySearch.value = v; },
});
const hasActiveFilters = galleryHasActiveFilters;
const resetGalleryFilters = () => ui.resetGalleryFilters();

const tabs = computed(() => [
  { key: "all", label: "All", count: images.value.length },
  ...IMAGE_GEN_KINDS
    .filter((k) => (countsByKind.value[k] ?? 0) > 0)
    .map((k) => ({ key: k, label: KIND_META[k].label, count: countsByKind.value[k] })),
]);

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return images.value.filter((img) => {
    if (activeKind.value !== "all" && img.kind !== activeKind.value) return false;
    if (q && !img.prompt.toLowerCase().includes(q)) return false;
    return true;
  });
});

function kindLabel(kind: string): string {
  return KIND_META[kind as ImageGenKind]?.label ?? kind;
}

function navTarget(img: GalleryImage): boolean {
  return !!(KIND_META[img.kind]?.route && img.target_id);
}

function goToEntity(img: GalleryImage) {
  const route = KIND_META[img.kind]?.route;
  if (route && img.target_id) router.push(`${route}/${img.target_id}`);
}

async function onDelete(img: GalleryImage) {
  const ok = await confirm("Remove this image from your gallery? The art stays on its entity; only the gallery record is removed.");
  if (ok) await deleteImage(img.id);
}
</script>
