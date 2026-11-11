/*
 * The chapter editor's side of the Illuminator (#1176 story 9b).
 *
 * Three things hang together here. A picture's recipe can change from the panel
 * or the workbench; the page then shows a small quick render (usePicturePreviews)
 * while the real bake runs in the background once edits pause
 * (usePictureBakes). And the workbench itself, the full-screen Illuminator
 * over the book, opens on the selected picture's recipe and writes one back on
 * Done. None of it touches the document except through `pictures.treat`.
 */
import { computed, ref, watch, type Ref } from "vue";
import type { Editor } from "@tiptap/core";
import { getCurrentUser } from "@/lib/supabase";
import { parsePublicUrl } from "@/lib/storage";
import type { WorkbenchTool } from "@/scriptorium/illuminator/useIlluminateWorkbench";
import { parseSettings, type IlluminateSettings } from "@/scriptorium/illuminator/lib/treatment";
import { usePictureBakes } from "@/scriptorium/composables/usePictureBakes";
import { usePicturePreviews } from "@/scriptorium/composables/usePicturePreviews";
import type { PictureActions, PictureTarget } from "@/scriptorium/composables/useEditorPictures";
import type { PanelSelection } from "@/scriptorium/composables/useScriptoriumSelection";
import { bookPageNumber } from "@/scriptorium/lib/panel/pageInfo";
import { treatmentPatch } from "@/scriptorium/lib/panel/pictureTreatment";
import type { PageFurnitureItem } from "@/scriptorium/types";

export interface OpenWorkbench {
  target: PictureTarget;
  original: string;
  settings: IlluminateSettings | null;
  name: string;
  /** "page 3": where Done goes back to. */
  pageLabel: string;
  /** The tool it opens on (Crop, from the panel's Crop button). */
  tool: WorkbenchTool;
  /** The page's width over height for art placed on the page (the crop's Page shape); null for a picture in the text. */
  pageAspect: number | null;
}

interface Options {
  editor: Ref<Editor | undefined>;
  selection: Ref<PanelSelection>;
  /** Bumped on every editor transaction: the editor is not reactive, this is how attrs are re-read. */
  version: Ref<number>;
  pictures: PictureActions;
  furniture: () => PageFurnitureItem[];
  setFurniture: (items: PageFurnitureItem[]) => void;
  firstPageLabel: () => string | null;
  /** Where the pictures are drawn: the sheet. */
  sheet: () => ParentNode | null;
  /** The page's width over height. */
  pageAspect: () => number;
}

/**
 * Whether a picture can be edited: any picture served from our storage, in either URL shape. The recipe only
 * ever reads the original, so it need not live in the bucket the bakes go to. An outside picture cannot be read
 * back into a canvas (it would taint it), so it stays as it is.
 */
export function isEditablePicture(url: string | null): url is string {
  return url !== null && parsePublicUrl(url) !== null;
}

/** The file edits start from: the untouched original of a treated picture, else the picture itself. */
export function originalOf(values: Readonly<Record<string, unknown>> | null): string | null {
  if (!values) return null;
  const original: unknown = values.original;
  const src: unknown = values.src;
  const url = typeof original === "string" && original !== "" ? original : src;
  return typeof url === "string" && url !== "" ? url : null;
}

export function usePictureEditing(opts: Options) {
  const currentUserId = () => getCurrentUser()?.id;

  const bakes = usePictureBakes({
    editor: () => opts.editor.value,
    furniture: opts.furniture,
    setFurniture: opts.setFurniture,
    userId: currentUserId,
  });
  const previews = usePicturePreviews({ editor: () => opts.editor.value, furniture: opts.furniture, sheet: opts.sheet });

  /** A recipe may have changed: draw it small on the page now, and bake it properly once edits pause. */
  function picturesChanged() {
    previews.schedule();
    bakes.schedule();
  }
  // Every transaction may have edited a picture; furniture edits come in through the shell's array.
  watch(
    opts.editor,
    (ed, _before, onCleanup) => {
      if (!ed) return;
      ed.on("transaction", picturesChanged);
      onCleanup(() => ed.off("transaction", picturesChanged));
      // Pictures left stale by an earlier session (or an import) catch up on opening.
      picturesChanged();
    },
    { immediate: true },
  );
  watch(opts.furniture, picturesChanged, { deep: true, flush: "post" });

  const target = computed<PictureTarget | null>(() => {
    const sel = opts.selection.value;
    if (sel.kind !== "picture") return null;
    return sel.source === "node" ? { source: "node", pos: sel.pos } : { source: "furniture", id: sel.id };
  });
  const values = computed(() => {
    void opts.version.value;
    void opts.furniture();
    return target.value ? opts.pictures.valuesOf(target.value) : null;
  });
  const canEditPicture = computed(() => isEditablePicture(originalOf(values.value)));

  const workbench = ref<OpenWorkbench | null>(null);

  function openWorkbench(tool: WorkbenchTool = "edges") {
    const t = target.value;
    const v = values.value;
    const original = originalOf(v);
    if (!t || !v || !isEditablePicture(original)) return;
    const label = [v.alt, v.title].find((x): x is string => typeof x === "string" && x.trim() !== "");
    const page = opts.pictures.pageOfPicture(t);
    const inBook = page === null ? null : bookPageNumber(opts.firstPageLabel(), page);
    workbench.value = {
      target: t,
      original,
      settings: parseSettings(v.illuminate),
      name: label ?? "your picture",
      pageLabel: page === null ? "the page" : `page ${inBook ?? page}`,
      tool,
      pageAspect: t.source === "furniture" ? opts.pageAspect() : null,
    };
  }

  function onWorkbenchDone(settings: IlluminateSettings) {
    const open = workbench.value;
    workbench.value = null;
    if (!open) return;
    // The picture may have been removed while the workbench was open.
    const now = opts.pictures.valuesOf(open.target);
    if (now) opts.pictures.treat(open.target, treatmentPatch(now, settings));
  }

  return { canEditPicture, workbench, openWorkbench, onWorkbenchDone, currentUserId };
}
