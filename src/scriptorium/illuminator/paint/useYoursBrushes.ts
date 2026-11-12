/*
 * The painter's own brushes inside a painting session (#1181): the library they show up in, autosave of a tuned
 * one, rename, delete, save-as-new, import, and the loading of their tips and grains. The session keeps which
 * brush each tool has armed; this keeps everything about Yours.
 *
 * The debounce is hand-written rather than `useAutosave` on purpose: that composable watches one reactive form
 * draft, while a brush is tuned from three places (the settings panel, the options bar's smoothing and the mode
 * menu) onto session state that is not a draft, and switching brushes inside the window leaves two dirty at once.
 * It still reports through the same `AutosaveStatus` the forms use.
 */
import { computed, onScopeDispose, ref, watch } from "vue";
import { useConfirm } from "@/composables/useConfirm";
import type { AutosaveStatus } from "@/composables/useAutosave";
import { useToast } from "@/composables/useToast";
import type { PaintAssetStore } from "./assets/loadPaintAssets";
import { STOCK_BRUSHES } from "./brushes/stockBrushes";
import { brushFromTip, type NewTip } from "./brushes/newTip";
import { isUserImageId, rowFromPreset } from "./brushes/userBrushes";
import type { BrushPreset } from "./engine/types";
import { useBrushImport } from "./useBrushImport";
import { useUserBrushes, type UserBrushesHandle } from "./useUserBrushes";

export type UserBrushesApi = Pick<UserBrushesHandle, "brushes" | "create" | "importMany" | "update" | "rename" | "remove">;

/** How long a tuned Yours brush waits for the next change before it is written. */
export const AUTOSAVE_MS = 800;

export function useYoursBrushes(assets: PaintAssetStore, userApi?: UserBrushesApi) {
  const user = userApi ?? useUserBrushes(assets);
  const confirmer = useConfirm();
  const toast = useToast();
  const importer = useBrushImport(user.importMany);

  /** Bumped when a painter's own tip or grain finishes loading, so the library's previews draw it. */
  const assetsRev = ref(0);
  const library = computed<BrushPreset[]>(() => {
    void assetsRev.value;
    return [...STOCK_BRUSHES, ...user.brushes.value.map((b) => b.preset)];
  });
  const setNames = computed<Record<string, string | null>>(() => Object.fromEntries(user.brushes.value.map((b) => [b.preset.id, b.setName])));
  /** The brushes whose tip an image model made: they carry the AI-made chip in the library. */
  const aiMade = computed(() => new Set(user.brushes.value.filter((b) => b.source === "described").map((b) => b.preset.id)));
  const isOwn = (id: string) => user.brushes.value.some((b) => b.preset.id === id);

  // ---- tips and grains: the engine reads them synchronously, so they are loaded before a brush is armed ----
  function loading(b: BrushPreset): Promise<unknown>[] {
    const out: Promise<unknown>[] = [];
    if (b.tip.source.kind === "image" && isUserImageId(b.tip.source.id) && !assets.tip(b.tip.source.id)) out.push(assets.loadTip(b.tip.source.id));
    if (b.grain && isUserImageId(b.grain.id) && !assets.grain(b.grain.id)) out.push(assets.loadGrain(b.grain.id));
    return out;
  }
  watch(
    () => user.brushes.value,
    (list) => {
      const all = list.flatMap((b) => loading(b.preset));
      if (all.length > 0) void Promise.allSettled(all).then(() => assetsRev.value++);
    },
    { immediate: true },
  );
  /** Resolves once the brush can paint: at once for a stock brush, after its pictures load for one of Yours. */
  function ready(b: BrushPreset): Promise<void> | null {
    const wait = loading(b);
    if (wait.length === 0) return null;
    return Promise.all(wait).then(
      () => {
        assetsRev.value++;
      },
      () => {
        toast.error("That brush's picture could not be loaded.");
        throw new Error("brush picture did not load");
      },
    );
  }

  // ---- autosave ----
  const unsaved = new Map<string, BrushPreset>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const inFlight = ref(0);
  const saveError = ref("");
  const waiting = ref(false);
  const status = computed<AutosaveStatus>(() => {
    if (saveError.value) return "error";
    if (inFlight.value > 0) return "saving";
    return waiting.value ? "dirty" : "saved";
  });

  function flush(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    waiting.value = false;
    const batch = [...unsaved.values()];
    unsaved.clear();
    for (const preset of batch) {
      inFlight.value++;
      saveError.value = "";
      user
        .update({ id: preset.id, preset })
        .catch(() => {
          saveError.value = `"${preset.name}" could not be saved.`;
          toast.error(saveError.value);
        })
        .finally(() => {
          inFlight.value--;
        });
    }
  }
  /** A tuned Yours brush is written after a pause; a stock brush never is (Save as new brush keeps a tuned one). */
  function scheduleSave(b: BrushPreset): void {
    if (!isOwn(b.id)) return;
    unsaved.set(b.id, b);
    waiting.value = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, AUTOSAVE_MS);
  }
  onScopeDispose(flush);

  // ---- make, rename, delete ----
  /** The brush kept as a new one in Yours with its own tip and grain pictures; null when it could not be kept. */
  async function saveAsNew(current: BrushPreset): Promise<BrushPreset | null> {
    const stored = rowFromPreset(current);
    const tip = stored.ownTip && current.tip.source.kind === "image" ? (assets.tip(current.tip.source.id) ?? null) : null;
    const grain = stored.ownGrain && current.grain ? (assets.grain(current.grain.id) ?? null) : null;
    try {
      return await user.create({ preset: { ...current, name: `${current.name} copy` }, tip, grain, source: "made", setName: null });
    } catch {
      toast.error("The brush could not be saved.");
      return null;
    }
  }
  /**
   * Each tip kept as a brush in Yours with `base`'s settings; the ones made, in order (all of them, or only the first
   * few when a later write failed). Null when none could be saved.
   */
  async function saveTips(base: BrushPreset, items: readonly NewTip[]): Promise<BrushPreset[] | null> {
    const made: BrushPreset[] = [];
    try {
      for (const item of items) {
        const { preset, grain } = brushFromTip(base, item, (id) => assets.grain(id));
        made.push(await user.create({ preset, tip: item.tip, grain, source: item.source, setName: null }));
      }
      return made;
    } catch {
      toast.error(made.length > 0 ? `Only ${made.length} of ${items.length} brushes could be saved.` : "The brush could not be saved.");
      return made.length > 0 ? made : null;
    }
  }
  /** Whether the rename was made. */
  async function rename(id: string, name: string): Promise<boolean> {
    if (!isOwn(id)) return false;
    try {
      await user.rename({ id, name });
      return true;
    } catch {
      toast.error("The brush could not be renamed.");
      return false;
    }
  }
  /** Asks first; the row and its tip and grain files go. Whether the brush was deleted. */
  async function remove(id: string): Promise<boolean> {
    const own = user.brushes.value.find((b) => b.preset.id === id);
    if (!own) return false;
    const ok = await confirmer.confirm(`Delete "${own.preset.name}"? Its picture files go with it.`, { title: "Delete brush", confirmLabel: "Delete" });
    if (!ok) return false;
    unsaved.delete(id);
    try {
      await user.remove(id);
      return true;
    } catch {
      toast.error("The brush could not be deleted.");
      return false;
    }
  }

  return {
    library,
    setNames,
    isOwn,
    ready,
    scheduleSave,
    flush,
    status,
    saveError,
    saveAsNew,
    saveTips,
    aiMade,
    rename,
    remove,
    importing: importer.busy,
    importReport: importer.report,
    importFile: importer.importFile,
    dismissImport: importer.dismiss,
  };
}
