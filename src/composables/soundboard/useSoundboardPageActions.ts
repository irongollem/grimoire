import { ref, watch } from "vue";
import {
  useCreateSoundboardPage,
  useUpdateSoundboardPage,
  useDeleteSoundboardPage,
  useReorderSoundboardPages,
} from "@/composables/soundboard/useSoundboardPages";
import { useConfirm } from "@/composables/useConfirm";
import { useQuota } from "@/composables/billing/useQuota";
import type { SoundboardPage } from "@/types/sound.types";

/**
 * What a deck's page picker can do to its pages: add, rename, reorder, delete.
 * The tab strip (tablet and up) and the page sheet (phone) are two layouts of
 * one set of actions, so the actions live here and each picker owns only how
 * it draws them.
 */
export function useSoundboardPageActions(opts: {
  pages: () => SoundboardPage[];
  padCounts: () => Readonly<Record<string, number>>;
  /** The deck's chosen page; delete clears it, add moves it to the new page. */
  activePageId: { value: string | null };
}) {
  const { mutate: createPage } = useCreateSoundboardPage();
  const { mutate: updatePage } = useUpdateSoundboardPage();
  const { mutate: deletePage_m } = useDeleteSoundboardPage();
  const { mutate: reorderPages } = useReorderSoundboardPages();
  const { canCreate: canCreatePage } = useQuota("soundboard_pages");
  const showPagePaywall = ref(false);
  const { confirm } = useConfirm();

  // Local ordered copy for drag-and-drop.
  const orderedPages = ref<SoundboardPage[]>([]);
  watch(opts.pages, (next) => { orderedPages.value = [...next]; }, { immediate: true });

  function persistPageOrder() {
    const pages = opts.pages();
    const updates = orderedPages.value
      .map((p, index) => ({ id: p.id, sort_order: index }))
      .filter(({ id, sort_order }) => {
        const original = pages.find((p) => p.id === id);
        return original === undefined || original.sort_order !== sort_order;
      });
    reorderPages(updates);
  }

  /** Creates a page and selects it; `onCreated` lets the picker open its name for editing. */
  function addPage(onCreated?: (page: SoundboardPage) => void) {
    if (!canCreatePage.value) { showPagePaywall.value = true; return; }
    const nextOrder = (orderedPages.value.at(-1)?.sort_order ?? -1) + 1;
    createPage(
      { name: "New Page", sort_order: nextOrder },
      {
        onSuccess: (page) => {
          opts.activePageId.value = page.id;
          onCreated?.(page);
        },
      },
    );
  }

  function renamePage(id: string, name: string) {
    const trimmed = name.trim();
    if (trimmed) updatePage({ id, update: { name: trimmed } });
  }

  async function deletePage(id: string) {
    // A page's pads go with it, so a page that holds some asks first.
    const held = opts.padCounts()[id] ?? 0;
    if (held > 0) {
      const ok = await confirm(
        `This page holds ${held} ${held === 1 ? "pad" : "pads"}. They come off the deck; the sounds stay in your library.`,
        { title: "Delete this page?", confirmLabel: "Delete page" },
      );
      if (!ok) return;
    }
    deletePage_m(id, {
      onSuccess: () => {
        // The deck shows the first page when none is chosen.
        if (opts.activePageId.value === id) opts.activePageId.value = null;
      },
    });
  }

  return { orderedPages, persistPageOrder, addPage, renamePage, deletePage, canCreatePage, showPagePaywall };
}
