/*
 * The book's chapters as the layout engine wants them (#1115): one HTML string
 * per chapter, DM-only blocks already taken out (layoutContent.ts), linked
 * entries resolved to their current text.
 *
 * Only the chapter being written is read from the live editor; the others come
 * from the cached full list and are converted once per `updated_at`, so a
 * keystroke costs one chapter's serialisation, never the book's (a 533-page
 * book is megabytes of HTML). The chapters are built when a render asks
 * (`chapters()`), never to notice a change: `version` is the cheap signal.
 */
import { computed, ref, watch, type Ref } from "vue";
import type { JSONContent } from "@tiptap/core";
import { useBookChaptersFull } from "@/composables/scriptorium/useScriptoriumChapters";
import { useEntityEmbedData } from "@/composables/scriptorium/useEntityEmbedData";
import { chapterLayoutHtml } from "@/lib/scriptorium/layoutContent";
import { collectEntityRefs, entityRefKey, resolveEntityEmbeds } from "@/lib/scriptorium/entityEmbeds";
import type { EntityRef } from "@/lib/scriptorium/entityEmbeds";
import type { BookChapterInput } from "@/lib/scriptorium/bookLayout/types";
import type { ScriptoriumKind, ScriptoriumTheme } from "@/types/scriptorium.types";

export interface LiveChapter {
  id: string;
  json: JSONContent;
}

interface Memo {
  key: string;
  html: string;
  resolvedFor: unknown;
  resolved: string;
}

const EMBED_MARKER = 'data-type="entityEmbed"';

export function useBookChapterHtml(options: {
  documentId: Ref<string>;
  kind: Ref<ScriptoriumKind>;
  theme: Ref<ScriptoriumTheme>;
  /** The chapter in the editor: its text comes from here, not from the cache. */
  live: Ref<LiveChapter | null>;
  /** Bumped by the editor on every edit of the live chapter. */
  liveVersion: Ref<number>;
  /** False while nothing displays the book (Write mode): the full list is then not even fetched. */
  enabled: Ref<boolean>;
}) {
  const { documentId, kind, theme, live, liveVersion, enabled } = options;
  const fullQuery = useBookChaptersFull(documentId, { enabled });
  const full = fullQuery.data;
  const ready = computed(() => !!full.value && full.value.length > 0);

  const memos = new Map<string, Memo>();
  function memoFor(id: string, stamp: string, json: JSONContent): Memo {
    const key = `${stamp}|${kind.value}`;
    const hit = memos.get(id);
    if (hit && hit.key === key) return hit;
    const html = chapterLayoutHtml(json, kind.value);
    const next: Memo = { key, html, resolvedFor: null, resolved: html };
    memos.set(id, next);
    return next;
  }

  /** The live chapter is rebuilt per edit; its memo is keyed on the edit count. */
  function entryOf(chapter: { id: string; updated_at: string; content: JSONContent }): Memo {
    const l = live.value;
    if (l && l.id === chapter.id) return memoFor(chapter.id, `live:${liveVersion.value}`, l.json);
    return memoFor(chapter.id, chapter.updated_at, chapter.content);
  }

  // The links of a chapter, found in its JSON alone (a keystroke must not
  // serialise HTML just to learn what the chapter links to).
  const refMemos = new Map<string, { key: string; refs: EntityRef[] }>();
  function refsOf(chapter: { id: string; updated_at: string; content: JSONContent }): EntityRef[] {
    const l = live.value;
    const isLive = !!l && l.id === chapter.id;
    const key = isLive ? `live:${liveVersion.value}` : chapter.updated_at;
    const hit = refMemos.get(chapter.id);
    if (hit && hit.key === key) return hit.refs;
    const refs = collectEntityRefs(l && isLive ? l.json : chapter.content);
    refMemos.set(chapter.id, { key, refs });
    return refs;
  }

  const entityRefs = computed<EntityRef[]>(() => {
    // Read the edit count so a link added in the editor is fetched at once.
    void liveVersion.value;
    const seen = new Map<string, EntityRef>();
    for (const chapter of full.value ?? []) {
      for (const ref of refsOf(chapter)) seen.set(entityRefKey(ref), ref);
    }
    return [...seen.values()];
  });
  const { lookup } = useEntityEmbedData(entityRefs, { theme });

  /** Changes whenever `chapters()` would return something different. */
  const version = ref(0);
  watch([liveVersion, full, lookup, kind, enabled], () => {
    version.value++;
  });

  function chapters(): BookChapterInput[] {
    const out: BookChapterInput[] = [];
    for (const chapter of full.value ?? []) {
      const memo = entryOf(chapter);
      if (memo.html.includes(EMBED_MARKER) && memo.resolvedFor !== lookup.value) {
        memo.resolved = resolveEntityEmbeds(memo.html, lookup.value);
        memo.resolvedFor = lookup.value;
      }
      out.push({ id: chapter.id, html: memo.resolved });
    }
    for (const id of Array.from(memos.keys())) {
      if (!(full.value ?? []).some((c) => c.id === id)) memos.delete(id);
    }
    return out;
  }

  return { chapters, version, ready, entityRefs, fullQuery };
}
