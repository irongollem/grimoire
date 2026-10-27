// #884 review finding 1 — the embedded Drawing's autosave used to drop
// edits two ways: an edit made while a save was already in flight went
// unscheduled (`dirty` only reports its false→true edge, not a second edit
// arriving while already `true`), and a still-pending debounced save was
// never flushed on navigate-away. Both are reproduced directly against this
// composable, driving `workbenchRef` with a plain fake — `MapWorkbench`'s
// real edit/save surface is a handful of getter closures plus
// `markSaved()`/`getEditRevision()`, so a full component mount buys nothing
// here that the fake doesn't already give.
import { computed } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSiteDrawingEditor, type SiteDrawingWorkbenchRef } from "./useSiteDrawingEditor";
import { useToast } from "@/composables/useToast";
import type { DungeonMapLayers } from "@/types/dungeonMap.types";

const { updateMapStub, createMapStub, updateLocationStub } = vi.hoisted(() => ({
  updateMapStub: { mutateAsync: vi.fn(async (): Promise<unknown> => ({})) },
  createMapStub: { mutateAsync: vi.fn(async () => ({ id: "new-map" })) },
  updateLocationStub: { mutateAsync: vi.fn(async () => ({})) },
}));

vi.mock("@/composables/cartographer/useDungeonMaps", () => ({
  useCreateDungeonMap: () => createMapStub,
  useUpdateDungeonMap: () => updateMapStub,
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useUpdateLocation: () => updateLocationStub,
}));

function makeFakeWorkbench(name = "Test Drawing") {
  let revision = 0;
  return {
    getName: () => name,
    getCampaignId: () => null,
    getLayers: () => ({}) as DungeonMapLayers,
    getMetadata: () => ({}),
    getCurrentPackId: () => "stone-dungeon",
    getDarkness: () => "dim" as const,
    getRuntimes: () => new Map(),
    getCellGlyphs: () => ({}),
    getStructure: () => ({ spaces: [], ways: [], stairs: [], links: [] }),
    getCellsPainted: () => 0,
    getPackName: () => "Stone Dungeon",
    isDirty: () => true,
    getEditRevision: () => revision,
    resetEdits: vi.fn(),
    markSaved: vi.fn(),
    bump: () => { revision++; },
  };
}

const location = computed(() => ({ id: "loc-1", name: "Ashmouth Undercroft", source_map_id: "map-1" }));
const drawingMap = computed(() => ({ tags: [] }));

describe("useSiteDrawingEditor", () => {
  const { toasts } = useToast();

  beforeEach(() => {
    toasts.value = [];
    updateMapStub.mutateAsync.mockClear();
    updateMapStub.mutateAsync.mockImplementation(async () => ({}));
    createMapStub.mutateAsync.mockClear();
    updateLocationStub.mutateAsync.mockClear();
  });

  it("onEditRevision re-arms the debounce on every edit, not just the first (finding 1)", () => {
    vi.useFakeTimers();
    try {
      const editor = useSiteDrawingEditor(location, drawingMap);
      const wb = makeFakeWorkbench();
      editor.workbenchRef.value = wb as unknown as SiteDrawingWorkbenchRef;

      editor.onEditRevision(); // stroke 1
      wb.bump();
      vi.advanceTimersByTime(1000); // short of the 1500ms debounce
      editor.onEditRevision(); // stroke 2 — must re-arm, `dirty` never toggled off in between
      wb.bump();
      vi.advanceTimersByTime(1000); // 2000ms since stroke 1, but only 1000ms since stroke 2

      expect(updateMapStub.mutateAsync).not.toHaveBeenCalled(); // stroke 2 re-armed the debounce
    } finally {
      vi.useRealTimers();
    }
  });

  it("an edit that lands while a save is already in flight is not marked saved, and stays dirty (finding 1)", async () => {
    let resolveUpdate!: (v: unknown) => void;
    updateMapStub.mutateAsync.mockImplementation(
      () => new Promise<unknown>((resolve) => { resolveUpdate = resolve; }),
    );

    const editor = useSiteDrawingEditor(location, drawingMap);
    const wb = makeFakeWorkbench();
    editor.workbenchRef.value = wb as unknown as SiteDrawingWorkbenchRef;

    editor.onEditRevision(); // stroke 1 — revision 1
    wb.bump();

    const savePromise = editor.save(); // reads revision 1, then awaits the mutation
    editor.onEditRevision(); // stroke 2 lands mid-flight — revision 2
    wb.bump();

    resolveUpdate({});
    await savePromise;

    expect(wb.markSaved).not.toHaveBeenCalled(); // stroke 2 must not be marked saved along with stroke 1
    expect(editor.dirty.value).toBe(true); // still unsaved work
  });

  it("saving with no edits in flight clears dirty and marks the workbench saved", async () => {
    const editor = useSiteDrawingEditor(location, drawingMap);
    const wb = makeFakeWorkbench();
    editor.workbenchRef.value = wb as unknown as SiteDrawingWorkbenchRef;

    editor.onEditRevision();
    await editor.save();

    expect(wb.markSaved).toHaveBeenCalledOnce();
    expect(editor.dirty.value).toBe(false);
  });

  describe("flush (#884 review finding 1 — navigate-away)", () => {
    it("cancels the pending debounce and saves immediately", async () => {
      vi.useFakeTimers();
      try {
        const editor = useSiteDrawingEditor(location, drawingMap);
        const wb = makeFakeWorkbench();
        editor.workbenchRef.value = wb as unknown as SiteDrawingWorkbenchRef;

        editor.onEditRevision(); // arms a 1500ms debounce that would otherwise fire later
        await editor.flush();

        expect(updateMapStub.mutateAsync).toHaveBeenCalledOnce();
        expect(wb.markSaved).toHaveBeenCalledOnce();
        expect(editor.dirty.value).toBe(false);

        // The debounce it cancelled never fires a second save.
        await vi.advanceTimersByTimeAsync(2000);
        expect(updateMapStub.mutateAsync).toHaveBeenCalledOnce();
      } finally {
        vi.useRealTimers();
      }
    });

    it("is a no-op when there is nothing unsaved", async () => {
      const editor = useSiteDrawingEditor(location, drawingMap);
      const wb = makeFakeWorkbench();
      editor.workbenchRef.value = wb as unknown as SiteDrawingWorkbenchRef;

      await editor.flush();

      expect(updateMapStub.mutateAsync).not.toHaveBeenCalled();
    });

    it("toasts when the teardown save itself fails, rather than losing the edit silently", async () => {
      updateMapStub.mutateAsync.mockRejectedValueOnce(new Error("network"));
      const editor = useSiteDrawingEditor(location, drawingMap);
      const wb = makeFakeWorkbench();
      editor.workbenchRef.value = wb as unknown as SiteDrawingWorkbenchRef;

      editor.onEditRevision();
      await editor.flush();

      expect(toasts.value).toHaveLength(1);
      expect(toasts.value[0]).toMatchObject({ type: "error", message: "network" });
      expect(wb.markSaved).not.toHaveBeenCalled();
    });
  });

  it("creates the map and points source_map_id at it the first time a mapless site is painted on", async () => {
    const newLocation = computed(() => ({ id: "loc-2", name: "Fresh Site", source_map_id: null }));
    const editor = useSiteDrawingEditor(newLocation, drawingMap);
    const wb = makeFakeWorkbench();
    editor.workbenchRef.value = wb as unknown as SiteDrawingWorkbenchRef;

    editor.onEditRevision();
    await editor.save();

    expect(createMapStub.mutateAsync).toHaveBeenCalledOnce();
    expect(updateLocationStub.mutateAsync).toHaveBeenCalledWith({ id: "loc-2", update: { source_map_id: "new-map" } });
  });

  it("save with nothing unsaved writes nothing", async () => {
    const editor = useSiteDrawingEditor(location, drawingMap);
    editor.workbenchRef.value = makeFakeWorkbench() as unknown as SiteDrawingWorkbenchRef;
    await editor.save();
    expect(updateMapStub.mutateAsync).not.toHaveBeenCalled();
  });

  it("a second save while one is in flight does not write twice", async () => {
    let resolveUpdate!: (v: unknown) => void;
    updateMapStub.mutateAsync.mockImplementation(() => new Promise<unknown>((resolve) => { resolveUpdate = resolve; }));
    const editor = useSiteDrawingEditor(location, drawingMap);
    editor.workbenchRef.value = makeFakeWorkbench() as unknown as SiteDrawingWorkbenchRef;
    editor.onEditRevision();

    const first = editor.save();
    await editor.save();
    resolveUpdate({});
    await first;

    expect(updateMapStub.mutateAsync).toHaveBeenCalledOnce();
  });

  it("names a drawing whose name was cleared after its site, and keeps the drawing's tags", async () => {
    const editor = useSiteDrawingEditor(location, computed(() => ({ tags: ["undercroft"] })));
    editor.workbenchRef.value = makeFakeWorkbench("   ") as unknown as SiteDrawingWorkbenchRef;
    editor.onEditRevision();
    await editor.save();
    expect(updateMapStub.mutateAsync).toHaveBeenCalledWith({
      id: "map-1",
      update: expect.objectContaining({ name: "Ashmouth Undercroft", tags: ["undercroft"] }),
    });
  });

  it("re-arms the save after an edit landed mid-flight, so that edit is written too", async () => {
    vi.useFakeTimers();
    try {
      let resolveUpdate!: (v: unknown) => void;
      updateMapStub.mutateAsync.mockImplementationOnce(() => new Promise<unknown>((resolve) => { resolveUpdate = resolve; }));
      const editor = useSiteDrawingEditor(location, drawingMap);
      const wb = makeFakeWorkbench();
      editor.workbenchRef.value = wb as unknown as SiteDrawingWorkbenchRef;
      editor.onEditRevision();
      wb.bump();

      const first = editor.save();
      editor.onEditRevision();
      wb.bump();
      // A slow save: the debounce armed by the mid-flight edit fires while the first write is still out, and is ignored.
      await vi.advanceTimersByTimeAsync(2000);
      expect(updateMapStub.mutateAsync).toHaveBeenCalledOnce();
      resolveUpdate({});
      await first;
      // The re-arm after the save is what writes the late stroke.
      await vi.advanceTimersByTimeAsync(1500);

      expect(updateMapStub.mutateAsync).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("when the workbench reports itself clean again (a Cancel), the pending save is dropped", async () => {
    vi.useFakeTimers();
    try {
      const editor = useSiteDrawingEditor(location, drawingMap);
      editor.workbenchRef.value = makeFakeWorkbench() as unknown as SiteDrawingWorkbenchRef;
      editor.onEditRevision();
      editor.onDirtyChange(false);
      expect(editor.dirty.value).toBe(false);
      await vi.advanceTimersByTimeAsync(3000);
      expect(updateMapStub.mutateAsync).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
