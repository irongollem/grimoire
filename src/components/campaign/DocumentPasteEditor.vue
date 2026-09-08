<template>
  <div>
    <label class="block text-eyebrow font-semibold text-muted-foreground mb-1">Paste the page text</label>
    <div @paste.capture="onEditorPasteCapture">
      <RichTextEditor :key="editorKey" v-model="content" size="lg" :placeholder="placeholder" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The rich-paste box shared by the settings importer's "paste text" source
 * step (`DocumentImportPasteStep.vue`, #829) and the compact create-quest
 * paste review (`QuestPasteImportPanel.vue`, #839) — extracted so a second
 * caller doesn't reimplement the tricky part below rather than reuse it.
 *
 * Native `RichTextEditor`, not a plain `<textarea>` — and this is the
 * opposite case from CLAUDE.md's "native <textarea> for AI-prompt fields"
 * exception, not a violation of it. That exception exists because a prompt
 * box's markup would be noise the model never asked for. Here the box holds
 * the SOURCE DOCUMENT, not a prompt: the whole feature depends on a real ⌘C
 * off a published page carrying HTML structure (headings, boxed text,
 * tables) that a flat textarea would throw away on paste — see
 * sourceHtml.ts's file header. A rich editor is also what lets the DM see
 * and trim what landed before spending credits, which a plain textarea
 * showing raw markdown would not.
 *
 * ── Why the paste handler intercepts in the capture phase ─────────────────
 *
 * `RichTextEditor.vue` is frozen (see its own file — it exposes no "insert
 * HTML" command, and its `modelValue` prop is read only once, at mount, not
 * watched — so there is no way to hand it new content after the fact except
 * through a real edit or its own internal paste handling). Its internal
 * `handlePaste`/ProseMirror listener is attached directly to the
 * contenteditable DOM node, which is the paste event's actual target — so a
 * normal (bubble-phase) listener on a wrapper around it would only ever run
 * *after* that internal handling already happened. Registering in the
 * **capture** phase (`@paste.capture`) runs this handler first, and calling
 * `stopPropagation()` (not just `preventDefault()`) stops the event from
 * ever reaching RichTextEditor's own listener at all — so normalization
 * fully replaces its handling for an HTML paste rather than running
 * alongside it and doubling the inserted content.
 *
 * Once normalized HTML is converted to Tiptap content
 * (`sourceHtmlToTiptapContent`), it is appended to the current document and
 * the editor is remounted via a bumped `:key` — the only way to hand it
 * fresh initial content, for the same "modelValue is mount-only" reason
 * above. A plain-text-only paste (no `text/html` flavour on the clipboard)
 * is left alone here and falls through to RichTextEditor's own existing
 * markdown/plain-text paste handling, which is already reasonable for that
 * case.
 */
import { ref } from "vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import { sourceHtmlToTiptapContent } from "@/lib/tiptap/sourceHtml";

const { placeholder = "Copy the whole page from your source and paste it here…" } = defineProps<{
  placeholder?: string;
}>();

/** The Tiptap document JSON, serialized — same contract `RichTextEditor`'s
 *  own `modelValue` uses. */
const content = defineModel<string>({ required: true });

/** Bumped to force `RichTextEditor` to remount with `content` as fresh
 *  initial content — see the file header on why a plain v-model set doesn't
 *  do it. */
const editorKey = ref(0);

function onEditorPasteCapture(event: ClipboardEvent) {
  const dt = event.clipboardData;
  if (!dt) return;
  const html = dt.getData("text/html");
  if (!html) return; // plain-text-only paste — let RichTextEditor handle it natively
  event.preventDefault();
  event.stopPropagation();

  const newBlocks = sourceHtmlToTiptapContent(html);
  let existingBlocks: unknown[] = [];
  if (content.value) {
    try {
      const parsed: unknown = JSON.parse(content.value);
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as { content?: unknown }).content)) {
        existingBlocks = (parsed as { content: unknown[] }).content;
      }
    } catch {
      // Malformed existing content shouldn't block a paste — start fresh.
    }
  }
  content.value = JSON.stringify({ type: "doc", content: [...existingBlocks, ...newBlocks] });
  editorKey.value++;
}

/** Clears the pasted content and forces a remount — the caller's own
 *  "start over" action after a successful submit or an explicit discard. */
function reset(): void {
  content.value = "";
  editorKey.value++;
}

defineExpose({ reset });
</script>
