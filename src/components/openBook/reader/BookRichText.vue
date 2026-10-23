<script setup lang="ts">
/**
 * Rich text inside the public book. Renders stored Tiptap JSON through `renderStoredDoc` with the chips replaced:
 * the default ones read the DB and campaign stores, which an anonymous visitor has neither of. A mention becomes
 * a link to the page it names when the book holds that page, a plain name when only the name is known, and a
 * quiet placeholder otherwise. Secret blocks and pending art draw nothing (the server already strips secrets).
 */
import { h, type VNodeChild } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { renderStoredDoc } from "@/lib/tiptap/viewerRender";
import type { BookModel } from "@/lib/openBook/bookModel";

const { content, model } = defineProps<{ content: unknown; model: BookModel }>();

const route = useRoute();

const PLACEHOLDERS: Record<string, string> = {
  player: "someone",
  npc: "someone",
  location: "somewhere",
  monster: "a creature",
  faction: "a faction",
  party: "the party",
};

function slug(): string {
  const raw = route.params.slug;
  return Array.isArray(raw) ? raw[0] : raw;
}

function mention(attrs: { id: string; entityType: string }): VNodeChild {
  const entry = model.byId.get(attrs.id);
  if (entry) {
    return h(
      RouterLink,
      { class: "book-xref", to: { name: "open-book-entry", params: { slug: slug(), chapter: entry.chapter, entryId: entry.id } } },
      () => entry.title,
    );
  }
  const name = model.nameFor(attrs.id);
  if (name) return h("span", { class: "book-name" }, name);
  return h("span", { class: "book-name book-name-unknown" }, PLACEHOLDERS[attrs.entityType] ?? "someone");
}

function render() {
  return renderStoredDoc(content, {
    chips: {
      entityMention: mention,
      calendarEventRef: ({ label }) => label,
      illustrationSuggestion: () => null,
      pendingImage: () => null,
      secretBlock: () => null,
    },
  });
}
</script>

<template>
  <component :is="render" />
</template>
