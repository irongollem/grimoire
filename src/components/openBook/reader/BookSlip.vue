<script setup lang="ts">
/**
 * A torn slip laid over the book (#1085): search the entries by name, and on a phone the contents and the visitor's
 * ribbons too. A native modal dialog, so focus is held inside it, Escape closes it and focus returns to what
 * opened it. Search is local to the snapshot already in the page; nothing is sent anywhere.
 */
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconClose, IconSearch } from "@/lib/icons";
import { searchBook } from "@/lib/openBook/bookSearch";
import { CHAPTER_META, type BookModel } from "@/lib/openBook/bookModel";
import type { Ribbon } from "@/lib/openBook/ribbons";
import { INDEX_KEY, chapterOpener, sectionLocation, type BookSection } from "@/lib/openBook/sections";

const { open, model, sections, slug, ribbons, withContents } = defineProps<{
  open: boolean;
  model: BookModel;
  sections: BookSection[];
  slug: string;
  ribbons: Ribbon[];
  /** A phone has no Contents spread to lean on, so the slip carries the chapters and ribbons itself. */
  withContents: boolean;
}>();

const emit = defineEmits<{ close: [] }>();

const dialog = useTemplateRef<HTMLDialogElement>("dialog");
const input = useTemplateRef<HTMLInputElement>("input");
const query = ref("");

const hits = computed(() =>
  searchBook(model, query.value).flatMap((entry) => {
    const section = sections.find((s) => s.entry?.id === entry.id);
    return section
      ? [{ id: entry.id, title: entry.title, where: CHAPTER_META[entry.chapter].title, to: sectionLocation(slug, section) }]
      : [];
  }),
);

const chapterRows = computed(() =>
  model.chapters.flatMap((chapter) => {
    const opener = chapterOpener(sections, chapter.chapter);
    return opener ? [{ id: chapter.chapter, numeral: chapter.numeral, title: chapter.title, count: chapter.entries.length, to: sectionLocation(slug, opener) }] : [];
  }),
);
const indexSection = computed(() => sections.find((s) => s.key === INDEX_KEY) ?? null);
const ribbonRows = computed(() =>
  ribbons.flatMap((r) => {
    const section = sections.find((s) => s.key === r.key);
    return section ? [{ key: `${r.key}:${r.unit}`, title: r.title, to: sectionLocation(slug, section, r.unit > 0 ? { s: String(r.unit) } : undefined) }] : [];
  }),
);

watch(
  () => open,
  async (isOpen) => {
    const el = dialog.value;
    if (!el) return;
    if (isOpen && !el.open) {
      query.value = "";
      if (typeof el.showModal === "function") el.showModal();
      else el.setAttribute("open", "");
      await nextTick();
      input.value?.focus();
    } else if (!isOpen && el.open) {
      if (typeof el.close === "function") el.close();
      else el.removeAttribute("open");
    }
  },
);

function onBackdrop(event: MouseEvent) {
  if (event.target === event.currentTarget) emit("close");
}
</script>

<template>
  <dialog ref="dialog" class="ob-dialog" aria-label="Search the book" @close="emit('close')" @cancel.prevent="emit('close')" @click="onBackdrop">
    <div class="ob-slip-wrap" :data-mode="withContents ? 'single' : 'spread'" @click="onBackdrop">
      <div class="ob-slip" data-slip>
        <AppButton class="ob-slip-close" variant="ghost" size="sm" :icon="IconClose" aria-label="Close" @click="emit('close')" />
        <label class="ob-slip-field">
          <IconSearch class="h-4 w-4" aria-hidden="true" />
          <span class="ob-sr">Search the book</span>
          <input ref="input" v-model="query" type="search" placeholder="Search the book" autocomplete="off" />
        </label>

        <template v-if="query.trim()">
          <div v-if="hits.length > 0" role="list">
            <RouterLink v-for="hit in hits" :key="hit.id" :to="hit.to" class="ob-slip-hit" role="listitem" @click="emit('close')">
              <span>{{ hit.title }}</span>
              <small>{{ hit.where }}</small>
            </RouterLink>
          </div>
          <p v-else class="ob-slip-empty">Nothing in this book goes by that name.</p>
        </template>

        <template v-else-if="withContents">
          <h2>Contents</h2>
          <RouterLink v-for="row in chapterRows" :key="row.id" :to="row.to" class="ob-slip-row" @click="emit('close')">
            <span class="ob-toc-num">{{ row.numeral }}</span>
            <span>{{ row.title }}</span>
            <span class="ob-toc-count">{{ row.count }}</span>
          </RouterLink>
          <RouterLink v-if="indexSection" :to="sectionLocation(slug, indexSection)" class="ob-slip-row" @click="emit('close')">
            <span />
            <span><em>Index of names</em></span>
            <span />
          </RouterLink>
          <div v-if="ribbonRows.length > 0" class="ob-ribbon-list">
            <span class="ob-eyebrow">Your ribbons</span>
            <span class="ob-ribbon-links">
              <RouterLink v-for="r in ribbonRows" :key="r.key" :to="r.to" class="ob-xref" @click="emit('close')">{{ r.title }}</RouterLink>
            </span>
          </div>
        </template>
      </div>
    </div>
  </dialog>
</template>
