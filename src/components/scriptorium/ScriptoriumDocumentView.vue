<template>
  <EmptyState
    v-if="contentError"
    title="This document could not be read"
    description="Its saved content isn't valid Scriptorium content."
  >
    <template #icon>
      <IconWarning class="h-16 w-16" />
    </template>
  </EmptyState>
  <EditorContent v-else-if="editor" :editor="editor" class="sc-theme sc-document-view" :class="themeClass" />
</template>

<script setup lang="ts">
/*
 * Read-only Scriptorium renderer (#915 story 3) — the same theme CSS and node
 * schema as the editing galley (`createScriptoriumExtensions()`), just
 * non-editable. Used wherever a saved document needs to be SHOWN rather than
 * edited: today, a quest beat's attached handout (QuestRunContainedTool.vue),
 * which previously went through the generic RichTextViewer — a schema with no
 * idea what a coverPage, noteBlock or entityEmbed node is, so a handout's
 * cover, read-aloud boxes and linked entities were silently dropped at the
 * table.
 *
 * `entityEmbed` nodes resolve themselves here exactly as they do in the
 * editor: this mounts a live (if non-editable) Tiptap `Editor` through
 * `<EditorContent>`, which is what makes `editor.contentComponent` non-null
 * and lets `VueNodeViewRenderer` mount `EntityEmbedView.vue` for real — no
 * separate resolveEntityEmbeds/HTML-string pass needed here, unlike the
 * pagination pipeline (which lays out a plain HTML string, not live
 * components).
 *
 * Presentational only — no pagination, no furniture, no editing UI. The
 * parent passes the whole document; this never fetches one itself.
 */
import { computed, onUnmounted, ref, watch } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import { createScriptoriumExtensions } from "@/lib/scriptorium/scriptoriumExtensions";
import { parseStoredContent, emptyDoc } from "@/lib/scriptorium/documentContent";
import type { ScriptoriumDocument } from "@/types/scriptorium.types";
import EmptyState from "@/components/common/EmptyState.vue";
import { IconWarning } from "@/lib/icons";

const props = defineProps<{ document: ScriptoriumDocument }>();

/** Stored content is current-version Tiptap JSON only (see documentContent.ts)
 *  — no HTML fallback. An unreadable row surfaces `contentError` instead. */
const contentError = ref<Error | null>(null);
function parseContent(content: string | null) {
  try {
    return parseStoredContent(content);
  } catch (e: unknown) {
    contentError.value = e instanceof Error ? e : new Error(String(e));
    return emptyDoc();
  }
}

const editor = useEditor({
  content: parseContent(props.document.content),
  editable: false,
  extensions: createScriptoriumExtensions(),
});

watch(
  () => props.document.content,
  (content) => {
    contentError.value = null;
    editor.value?.commands.setContent(parseContent(content));
  },
);

const themeClass = computed(() => (props.document.theme === "phb2014" ? "theme-phb2014" : "theme-onednd2024"));

onUnmounted(() => editor.value?.destroy());
</script>
