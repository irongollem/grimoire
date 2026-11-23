/**
 * Turning a model's draft into a Scriptorium document, extracted from `ScriptoriumDraftDialog` so Ask Grimoire files
 * a draft exactly as the dialog does (#1253). Deliberately narrow: the dialog keeps the paywall, the retained-draft
 * retry and the navigation; this is the book shape and the create call.
 */
import type { DraftKind } from "@edge-shared/scriptoriumDraft.ts";
import type { ScriptoriumDocInsert } from "@/scriptorium/types";
import type { ScriptoriumDraft } from "@/ai/useScriptoriumDraft";
import { htmlToScriptoriumJson } from "@/scriptorium/lib/documentContent";
import { handoutDefaults } from "@/scriptorium/lib/looks";
import { useCreateScriptoriumBook } from "@/scriptorium/composables/useScriptorium";

/** A draft remembers the kind it was drafted as: a handout is one sheet, the other kinds are books. */
export type KindedDraft = ScriptoriumDraft & { kind: DraftKind };

/** The document row and its one chapter for a draft. Pure. */
export function draftToBook(draft: KindedDraft, campaignId: string | null) {
  // A model's draft carries no page furniture (the draft prompt asks for headings and prose), so only the body is
  // kept; the anchor id is moot.
  const { content } = htmlToScriptoriumJson(draft.html, "");
  const filing: Pick<
    ScriptoriumDocInsert,
    "title" | "doc_type" | "campaign_id" | "tags" | "is_published" | "page_number_start" | "ink_friendly" | "ai_provenance" | "footer_title"
  > = {
    title: draft.title,
    doc_type: "custom",
    campaign_id: campaignId,
    tags: [],
    is_published: false,
    page_number_start: 1,
    ink_friendly: false,
    ai_provenance: draft.ai_provenance,
    // A draft comes with no footer text, so its pages carry their chapters' titles.
    footer_title: "chapter",
  };
  const book: ScriptoriumDocInsert =
    draft.kind === "handout"
      ? { ...filing, kind: "handout", theme: "plain", ...handoutDefaults("plain") }
      : {
          ...filing,
          kind: "book",
          theme: "grimoire",
          page_size: "A4",
          is_two_column: false,
          show_page_numbers: false,
          footer_text: "",
        };
  return { book, chapters: [{ content }] };
}

export function useSaveScriptoriumDraft() {
  const { mutateAsync: createBook } = useCreateScriptoriumBook();

  /** Files the draft; a failed save throws, so the caller decides whether to keep the paid draft. */
  async function saveDraft(draft: KindedDraft, campaignId: string | null) {
    return await createBook(draftToBook(draft, campaignId));
  }

  return { saveDraft };
}
