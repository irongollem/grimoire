import { storeToRefs } from "pinia";
import { useCreateScriptoriumBook } from "@/scriptorium/composables/useScriptorium";
import { useCampaignStore } from "@/stores/campaign";
import { handoutDefaults, scriptoriumLook } from "@/scriptorium/lib/looks";
import { splitIntoChapters } from "@/scriptorium/data/templates/chapters";
import type { ScriptoriumTemplate } from "@/scriptorium/data/templates";
import type { ScriptoriumDocInsert, ScriptoriumPaper } from "@/scriptorium/types";
import { footerTitleFor } from "@/scriptorium/lib/footerTitle";
import { buildCampaignBook, campaignBookTitle, type BookAudience } from "@/scriptorium/lib/canonBook";
import { fetchDmBookSource, fetchPlayersBookSource } from "@/scriptorium/lib/campaignBookSource";

/**
 * Starting a document is one write (#1115): a handout on a chosen paper, or a
 * book from a template. Both land in the active campaign when there is one, so
 * the handout can be given at once. Callers navigate to the returned id.
 */
export function useStartScriptoriumDocument() {
  const campaignStore = useCampaignStore();
  const { activeCampaignId } = storeToRefs(campaignStore);
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
      footer_title: footerTitleFor(defaults.footer_text),
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
      footer_title: footerTitleFor(s.footerText),
      page_number_start: s.pageNumberStart,
      tags: [...s.tags],
    };
    return (await mutateAsync({ book, chapters: splitIntoChapters(template.build()) })).id;
  }

  /**
   * A book drawn from the active campaign (#1226 story 8): chapters of linked entries, never copies. The DM's book
   * reads the DM's own tables; a players' book reads the whole party's view and is marked for it, so its preview and
   * print never resolve a field the party cannot read.
   */
  async function startBookFromCampaign(audience: BookAudience): Promise<string> {
    const campaignId = activeCampaignId.value;
    if (!campaignId) throw new Error("Open a campaign to draw a book from it.");
    const campaignName = campaignStore.activeCampaign?.name;
    if (!campaignName) throw new Error("The campaign has not loaded yet.");
    const source = audience === "dm" ? await fetchDmBookSource(campaignId) : await fetchPlayersBookSource(campaignId);
    const drawn = buildCampaignBook(source, audience);
    if (drawn.chapters.length === 0) throw new Error("The campaign has nothing to draw a book from yet.");
    const book: ScriptoriumDocInsert = {
      ...base(),
      title: campaignBookTitle(campaignName, audience),
      // Where it came from, so a renamed book is found again instead of drawn a second time (CanonOpenAsBook).
      drawn_from: "canon",
      kind: "book",
      doc_type: "custom",
      theme: "grimoire",
      page_size: "A4",
      is_two_column: false,
      ink_friendly: false,
      show_page_numbers: true,
      footer_text: "",
      footer_title: footerTitleFor(""),
      // Written only for a players' book: every other book leaves the column to its default.
      ...(audience === "players" ? { audience } : {}),
    };
    return (await mutateAsync({ book, chapters: drawn.chapters })).id;
  }

  return { startHandout, startBook, startBookFromCampaign, isStarting: isPending };
}
