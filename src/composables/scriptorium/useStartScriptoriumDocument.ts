import { storeToRefs } from "pinia";
import { useCreateScriptoriumBook } from "@/composables/scriptorium/useScriptorium";
import { useCampaignStore } from "@/stores/campaign";
import { handoutDefaults, scriptoriumLook } from "@/lib/scriptorium/looks";
import { splitIntoChapters } from "@/data/scriptoriumTemplates/chapters";
import type { ScriptoriumTemplate } from "@/data/scriptoriumTemplates";
import type { ScriptoriumDocInsert, ScriptoriumPaper } from "@/types/scriptorium.types";

/**
 * Starting a document is one write (#1115): a handout on a chosen paper, or a
 * book from a template. Both land in the active campaign when there is one, so
 * the handout can be given at once. Callers navigate to the returned id.
 */
export function useStartScriptoriumDocument() {
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  const { mutateAsync, isPending } = useCreateScriptoriumBook();

  const base = () => ({
    campaign_id: activeCampaignId.value,
    tags: [] as string[],
    is_published: false,
    ink_friendly: false,
    page_number_start: 1,
    page_furniture: [],
  });

  async function startHandout(paper: ScriptoriumPaper): Promise<string> {
    const defaults = handoutDefaults(paper);
    const book: ScriptoriumDocInsert = {
      ...base(),
      title: `Untitled ${scriptoriumLook(paper).label.toLowerCase()}`,
      kind: "handout",
      doc_type: "custom",
      theme: paper,
      page_size: defaults.page_size,
      is_two_column: defaults.is_two_column,
      show_page_numbers: defaults.show_page_numbers,
      footer_text: defaults.footer_text,
    };
    return (await mutateAsync({ book })).id;
  }

  async function startBook(template: ScriptoriumTemplate): Promise<string> {
    const s = template.settings;
    const book: ScriptoriumDocInsert = {
      ...base(),
      title: template.name,
      kind: "book",
      doc_type: template.docType,
      theme: s.theme,
      page_size: s.pageSize,
      is_two_column: s.isTwoColumn,
      ink_friendly: s.inkFriendly,
      show_page_numbers: s.showPageNumbers,
      footer_text: s.footerText,
      page_number_start: s.pageNumberStart,
      tags: [...s.tags],
    };
    return (await mutateAsync({ book, chapters: splitIntoChapters(template.build()) })).id;
  }

  return { startHandout, startBook, isStarting: isPending };
}
