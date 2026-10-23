<script setup lang="ts">
/** The thin bar above the book (#1085): back to the contents, where you are, search, the PDF, and the ribbon. */
import { RouterLink, type RouteLocationRaw } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconBookmark, IconChevronLeft, IconDownload, IconList, IconSearch } from "@/lib/icons";
import type { Crumb } from "@/lib/openBook/sections";

const { slug, crumbs, marked, pdfUrl = null, bookTitle } = defineProps<{
  slug: string;
  bookTitle: string;
  crumbs: Crumb[];
  marked: boolean;
  /** The release's PDF, when the DM offers one and this release has it. */
  pdfUrl?: string | null;
}>();

defineEmits<{ search: []; mark: [] }>();

const contents: RouteLocationRaw = { name: "open-book-contents", params: { slug } };
</script>

<template>
  <header class="ob-deskbar">
    <div class="ob-deskbar-group">
      <AppButton variant="outline" size="sm" :to="{ name: 'open-book', params: { slug } }" :icon="IconChevronLeft" label="Cover" />
      <AppButton variant="outline" size="sm" :to="contents" :icon="IconList" label="Contents" />
      <nav class="ob-crumbs" aria-label="Where you are">
        <span class="ob-booktitle">{{ bookTitle }}</span>
        <template v-for="(crumb, i) in crumbs" :key="i">
          <span aria-hidden="true">›</span>
          <RouterLink v-if="crumb.to" :to="crumb.to">{{ crumb.label }}</RouterLink>
          <span v-else :aria-current="i === crumbs.length - 1 ? 'page' : undefined">{{ crumb.label }}</span>
        </template>
      </nav>
    </div>
    <div class="ob-deskbar-group">
      <AppButton variant="outline" size="sm" :icon="IconSearch" label="Search" @click="$emit('search')" />
      <AppButton v-if="pdfUrl" variant="outline" size="sm" :href="pdfUrl" :icon="IconDownload" label="Download PDF" />
      <AppButton
        variant="outline"
        size="sm"
        :icon="IconBookmark"
        :label="marked ? 'Marked' : 'Mark this page'"
        :active="marked"
        :aria-pressed="marked"
        @click="$emit('mark')"
      />
    </div>
  </header>
</template>
