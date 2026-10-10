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
  <EmptyState
    v-else-if="missingCampaign"
    title="This handout is not available"
    description="It is not attached to a campaign."
  >
    <template #icon>
      <IconWarning class="h-16 w-16" />
    </template>
  </EmptyState>
  <EditorContent
    v-else-if="editor"
    :editor="editor"
    class="sc-theme sc-document-view"
    :class="[themeClass, { 'sc-document-view--reader': layout === 'reader' }]"
  />
</template>

<script setup lang="ts">
/*
 * Read-only Scriptorium renderer (#915 story 3) — the same theme CSS and node
 * schema as the editing galley (`createScriptoriumExtensions()`), just
 * non-editable. Used wherever a saved document needs to be SHOWN rather than
 * edited: a quest beat's attached handout (QuestRunContainedTool.vue), which
 * previously went through the generic RichTextViewer — a schema with no idea
 * what a coverPage, noteBlock or entityEmbed node is, so a handout's cover,
 * read-aloud boxes and linked entities were silently dropped at the table —
 * and, as of #915 story 7, the phone reading view (ScriptoriumReader.vue),
 * via `layout="reader"`. That prop only adds a modifier class; every
 * phone-specific override (cover-as-card, full-width images, scrollable
 * tables…) lives in ScriptoriumReader's own scoped styles, never here or in
 * the shared theme CSS.
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
import { computed, onUnmounted, provide, ref, watch } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import { createScriptoriumExtensions } from "@/lib/scriptorium/scriptoriumExtensions";
import { parseStoredContent, emptyDoc } from "@/lib/scriptorium/documentContent";
import type { ReadableScriptoriumDocument, ScriptoriumTheme } from "@/types/scriptorium.types";
import { SCRIPTORIUM_THEME_KEY } from "@/lib/scriptorium/scriptoriumTheme";
import { SCRIPTORIUM_AUDIENCE_KEY, type ScriptoriumAudience } from "@/lib/scriptorium/audience";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import { IconWarning } from "@/lib/icons";

// Renamed from the prop's own name to avoid shadowing the global `document`.
const { document: doc, layout = "page", audience = "dm" } = defineProps<{
  document: ReadableScriptoriumDocument;
  /** "reader" adds the `sc-document-view--reader` modifier class for the
   *  phone reading view (#915 story 7). Default "page" keeps today's
   *  page-shaped rendering (quest handouts, the desktop galley preview). */
  layout?: "page" | "reader";
  /** Who is reading (#970). "player" resolves every entity embed through the
   *  player-gated projections only (see EntityEmbedView.vue); "dm" is the
   *  default and today's behaviour. */
  audience?: "dm" | "player";
}>();

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
  content: parseContent(doc.content),
  editable: false,
  extensions: createScriptoriumExtensions(),
});

watch(
  () => doc.content,
  (content) => {
    contentError.value = null;
    editor.value?.commands.setContent(parseContent(content));
  },
);

const theme = computed<ScriptoriumTheme>(() => (doc.theme === "phb2014" ? "phb2014" : "onednd2024"));
// Read by entityEmbed node views (EntityEmbedView.vue) so a monster/NPC's
// stat block formats itself in THIS document's theme rather than a hardcoded
// default — the phone reader and quest handouts mount this view read-only,
// so getting this wrong wasn't merely a galley cosmetic gap (#917 story 2).
provide(SCRIPTORIUM_THEME_KEY, theme);
const themeClass = computed(() => (theme.value === "phb2014" ? "theme-phb2014" : "theme-onednd2024"));

// A shared handout always has a campaign (the player projections are keyed on
// it), so a player document without one is not renderable rather than being
// rendered with embeds that could never resolve.
const audienceState = computed<ScriptoriumAudience>(() =>
  audience === "player" && doc.campaign_id
    ? { audience: "player", campaignId: doc.campaign_id }
    : { audience: "dm" },
);
const missingCampaign = computed(() => audience === "player" && !doc.campaign_id);
provide(SCRIPTORIUM_AUDIENCE_KEY, audienceState);

onUnmounted(() => editor.value?.destroy());
</script>
