<template>
  <EditorContent v-if="editor" :editor="editor" class="sc-theme sc-document-view" :class="themeClass" />
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
import { computed, onUnmounted, watch } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import type { JSONContent } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/lib/scriptorium/scriptoriumExtensions";
import type { ScriptoriumDocument } from "@/types/scriptorium.types";

const props = defineProps<{ document: ScriptoriumDocument }>();

/** A document's content is Tiptap JSON — except the handful of documents
 *  created before #915 story 3, which still hold a raw HTML snapshot (see
 *  ScriptoriumEditor.vue's own computeInitialDoc for the same fallback).
 *  Tiptap accepts HTML directly as `content`, so this never throws. */
function parseContent(content: string | null): JSONContent | string {
  if (!content) return "";
  try {
    return JSON.parse(content) as JSONContent;
  } catch {
    return content;
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
    editor.value?.commands.setContent(parseContent(content));
  },
);

const themeClass = computed(() => (props.document.theme === "phb2014" ? "theme-phb2014" : "theme-onednd2024"));

onUnmounted(() => editor.value?.destroy());
</script>
