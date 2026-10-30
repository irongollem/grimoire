/*
 * The book's own settings (title, kind, campaign, look, page size, columns,
 * numbering, footer, tags, published, page furniture), held as a draft that
 * saves itself (#1115 story 13). The chapter text is not here: each chapter
 * saves through useSaveChapter.
 *
 * Only the columns that changed are sent, compared with what was last saved,
 * never the whole row, so a field the author never touched cannot overwrite a
 * newer value from another device (#946).
 */
import { reactive, watch } from "vue";
import { useAutosave } from "@/composables/useAutosave";
import { draftValueEqual } from "@/composables/useRecordDraft";
import { useUpdateScriptoriumDocument } from "@/composables/scriptorium/useScriptorium";
import { scriptoriumLook } from "@/lib/scriptorium/looks";
import type {
  PageFurnitureItem,
  ScriptoriumDocUpdate,
  ScriptoriumDocument,
  ScriptoriumKind,
  ScriptoriumPageSize,
  ScriptoriumTheme,
} from "@/types/scriptorium.types";

export interface BookSettingsDraft {
  title: string;
  kind: ScriptoriumKind;
  campaignId: string | null;
  theme: ScriptoriumTheme;
  pageSize: ScriptoriumPageSize;
  isTwoColumn: boolean;
  inkFriendly: boolean;
  showPageNumbers: boolean;
  pageNumberStart: number;
  footerText: string;
  isPublished: boolean;
  tags: string[];
  furniture: PageFurnitureItem[];
}

export function toSettingsDraft(doc: ScriptoriumDocument): BookSettingsDraft {
  return {
    title: doc.title,
    kind: doc.kind,
    campaignId: doc.campaign_id,
    theme: doc.theme,
    pageSize: doc.page_size,
    isTwoColumn: doc.is_two_column,
    inkFriendly: doc.ink_friendly,
    showPageNumbers: doc.show_page_numbers,
    pageNumberStart: doc.page_number_start,
    footerText: doc.footer_text,
    isPublished: doc.is_published,
    tags: [...doc.tags],
    furniture: [...(doc.page_furniture ?? [])],
  };
}

/** A pure function of its draft, so it can be run over the server copy too. */
export function settingsRow(d: BookSettingsDraft): ScriptoriumDocUpdate {
  return {
    title: d.title.trim(),
    kind: d.kind,
    campaign_id: d.campaignId,
    theme: d.theme,
    page_size: d.pageSize,
    is_two_column: d.isTwoColumn,
    ink_friendly: d.inkFriendly,
    show_page_numbers: d.showPageNumbers,
    page_number_start: d.pageNumberStart,
    footer_text: d.footerText,
    is_published: d.isPublished,
    tags: d.tags,
    page_furniture: d.furniture,
  };
}

/** The columns of `next` that differ from `previous`. */
export function changedSettings(previous: BookSettingsDraft, next: BookSettingsDraft): ScriptoriumDocUpdate {
  const before = settingsRow(previous);
  const after = settingsRow(next);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof ScriptoriumDocUpdate)[]) {
    if (!draftValueEqual(before[key], after[key])) out[key] = after[key];
  }
  return out as ScriptoriumDocUpdate;
}

/** A theme that belongs to the kind: switching a book to a handout needs a paper, and back a book look. */
export function themeForKind(kind: ScriptoriumKind, theme: ScriptoriumTheme): ScriptoriumTheme {
  const family = kind === "handout" ? "paper" : "book";
  if (scriptoriumLook(theme).family === family) return theme;
  return kind === "handout" ? "letter" : "onednd2024";
}

export function useBookSettings(doc: () => ScriptoriumDocument) {
  const { mutateAsync: update } = useUpdateScriptoriumDocument();
  const draft = reactive<BookSettingsDraft>(toSettingsDraft(doc()));
  let lastSaved: BookSettingsDraft = toSettingsDraft(doc());

  const autosave = useAutosave({
    draft,
    initial: () => toSettingsDraft(doc()),
    equal: (a, b) => draftValueEqual(settingsRow(a), settingsRow(b)),
    // A blank title waits: the status line says so instead of saving "".
    canSave: () => draft.title.trim() !== "",
    async save(snapshot) {
      const changed = changedSettings(lastSaved, snapshot);
      if (Object.keys(changed).length > 0) await update({ id: doc().id, update: changed });
      lastSaved = snapshot;
    },
    errorMessage: "Could not save the book's settings",
  });

  // The row moved on the server (another device). Our own save's echo compares equal and changes nothing.
  watch(
    () => doc().updated_at,
    () => {
      if (autosave.dirty.value || autosave.saving.value) return;
      const incoming = toSettingsDraft(doc());
      if (draftValueEqual(settingsRow(incoming), settingsRow(draft))) return;
      lastSaved = incoming;
      autosave.reset(incoming);
    },
  );

  function patch(values: Partial<BookSettingsDraft>) {
    Object.assign(draft, values);
  }

  return { draft, patch, ...autosave };
}
