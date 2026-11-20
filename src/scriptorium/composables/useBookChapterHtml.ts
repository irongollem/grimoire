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
import { useBookChaptersFull } from "@/scriptorium/composables/useScriptoriumChapters";
import { useEntityEmbedData } from "@/scriptorium/composables/useEntityEmbedData";
import { chapterLayoutHtml } from "@/scriptorium/lib/layoutContent";
import { useOpenBookPreview } from "@/composables/openBook/useOpenBookReleases";
import { plainWorldDate, snapshotEmbedLookup, type WorldDateLabel } from "@/scriptorium/lib/snapshotEmbeds";
import { collectEntityRefs, ENTITY_EMBED_MARKER, entityRefKey, resolveEntityEmbeds } from "@/scriptorium/lib/entityEmbeds";
import type { EntityRef } from "@/scriptorium/lib/entityEmbeds";
import type { BookChapterInput } from "@/scriptorium/lib/bookLayout/types";
import type { ScriptoriumBookAudience, ScriptoriumKind, ScriptoriumTheme } from "@/scriptorium/types";

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
  /**
   * Who the book is for. A players' book resolves its links from what the whole party may read (the Open Book's
   * snapshot) and prints nothing the snapshot lacks, so a preview or PDF the DM makes never holds a DM-only field.
   * Absent is the DM's book.
   */
  audience?: Ref<ScriptoriumBookAudience>;
  /** The book's campaign: the players' snapshot is read for it. */
  campaignId?: Ref<string | null>;
  /** How a date in the world is worded (the campaign's calendar); plain years by default. */
  worldDate?: WorldDateLabel;
}) {
  const { documentId, kind, theme, live, liveVersion, enabled } = options;
  const forPlayers = computed(() => options.audience?.value === "players");
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
  // A players' book asks the DM's tables for nothing: its links come from the whole-party snapshot alone.
  const dmRefs = computed<EntityRef[]>(() => (forPlayers.value ? [] : entityRefs.value));
  const { lookup: dmLookup } = useEntityEmbedData(dmRefs, { theme });
  const snapshot = useOpenBookPreview(
    () => options.campaignId?.value ?? null,
    () => forPlayers.value && enabled.value,
  );
  const lookup = computed(() =>
    forPlayers.value
      ? snapshotEmbedLookup(snapshot.data.value ?? null, entityRefs.value, options.worldDate ?? plainWorldDate)
      : dmLookup.value,
  );

  /** Changes whenever `chapters()` would return something different. */
  const version = ref(0);
  watch([liveVersion, full, lookup, kind, enabled, forPlayers], () => {
    version.value++;
  });

  function chapters(): BookChapterInput[] {
    const out: BookChapterInput[] = [];
    for (const chapter of full.value ?? []) {
      const memo = entryOf(chapter);
      if (memo.html.includes(ENTITY_EMBED_MARKER) && memo.resolvedFor !== lookup.value) {
        memo.resolved = resolveEntityEmbeds(memo.html, lookup.value, forPlayers.value ? "nothing" : "marker");
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
