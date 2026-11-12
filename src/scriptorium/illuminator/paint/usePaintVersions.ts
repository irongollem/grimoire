/*
 * Saved versions of a painting (#1181): named snapshots of its layers that survive closing the Illuminator, kept
 * in the recipe's paint step. Undo stays deep inside a session; this is what a painter keeps beyond it.
 *
 * A version points at chunk files that were current when it was saved (a save never rewrites a chunk in place),
 * so it costs no pixels, only a list of URLs. Nothing here writes the book: like the painting, versions live in
 * the workbench's step until Done, and Cancel drops the unsaved ones with the session.
 *
 * The workbench hands in everything with a side effect (saving, loading layers, confirming, sweeping), so the
 * rules (the cap, the naming, which files a dropped version frees) run in Node.
 */
import { computed, ref, type Ref } from "vue";
import type { PaintLayerRecord, PaintStep, PaintVersion } from "../lib/treatment";

/** How many versions each plan keeps. */
export const FREE_VERSIONS = 3;
export const PRO_VERSIONS = 10;
export const versionCap = (isPro: boolean): number => (isPro ? PRO_VERSIONS : FREE_VERSIONS);

type ConfirmOptions = { title?: string; confirmLabel?: string; danger?: boolean };

export interface PaintVersionsDeps {
  /** The workbench's current paint step (what Done will write). */
  step: Ref<PaintStep | null>;
  /** A painting session is running. */
  ready: () => boolean;
  /** The session holds at least one paint layer: there is something to keep. */
  hasPainting: () => boolean;
  isPro: () => boolean;
  /** Anything changed since the painting was last saved. */
  hasChanges: () => boolean;
  /** Saves the painting as Done does and leaves the result in `step`. */
  save: () => Promise<void>;
  /** Puts these layers into the session as one undoable step. */
  restore: (layers: PaintLayerRecord[]) => Promise<void>;
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  /** Marks files for the sweep. */
  release: (urls: string[]) => void;
  /** A plain-language failure for the painter. */
  fail: (message: string) => void;
  now?: () => Date;
  newId?: () => string;
}

const urlsOf = (layers: readonly PaintLayerRecord[]): string[] => layers.flatMap((l) => Object.values(l.chunks));

/** The next default name: one more than the highest "Version N" so far, so a rename never reuses a number. */
export function nextVersionName(versions: readonly PaintVersion[]): string {
  const highest = versions.reduce((top, v) => {
    const m = /^Version (\d+)$/.exec(v.name);
    return m ? Math.max(top, Number(m[1])) : top;
  }, 0);
  return `Version ${highest + 1}`;
}

/** The files only `dropped` names: not any kept version and not the painting itself. */
export function freedUrls(dropped: readonly PaintVersion[], step: PaintStep): string[] {
  const held = new Set([...urlsOf(step.layers), ...(step.versions ?? []).flatMap((v) => urlsOf(v.layers))]);
  return [...new Set(dropped.flatMap((v) => urlsOf(v.layers)))].filter((url) => !held.has(url));
}

export function usePaintVersions(deps: PaintVersionsDeps) {
  const busy = ref(false);
  const versions = computed<PaintVersion[]>(() => deps.step.value?.versions ?? []);
  const cap = computed(() => versionCap(deps.isPro()));
  const canSave = computed(() => deps.ready() && deps.hasPainting() && !busy.value);

  function free(dropped: readonly PaintVersion[], step: PaintStep): void {
    const urls = freedUrls(dropped, step);
    if (urls.length > 0) deps.release(urls);
  }

  /** The step with these versions, and none at all rather than an empty list. */
  function withVersions(step: PaintStep, next: PaintVersion[]): PaintStep {
    const base: PaintStep = { type: "paint", width: step.width, height: step.height, paper: step.paper, layers: step.layers };
    if (next.length > 0) base.versions = next;
    return base;
  }

  async function save(): Promise<void> {
    if (!canSave.value) return;
    const room = cap.value;
    const existing = versions.value;
    // Asked before anything is uploaded: a "no" costs nothing.
    const dropCount = Math.max(0, existing.length - room + 1);
    const dropped = existing.slice(0, dropCount);
    if (dropped.length > 0) {
      const oldest = dropped[0];
      const ok = await deps.confirm(`Keep this version? Your oldest, ${oldest?.name ?? ""}, makes room.`, { title: "Save version", confirmLabel: "Keep this version", danger: false });
      if (!ok) return;
    }
    busy.value = true;
    try {
      await deps.save();
      const step = deps.step.value;
      if (!step || step.layers.length === 0) return;
      const kept = (step.versions ?? []).slice(dropCount);
      const version: PaintVersion = {
        id: (deps.newId ?? (() => crypto.randomUUID().slice(0, 8)))(),
        name: nextVersionName(step.versions ?? []),
        savedAt: (deps.now ?? (() => new Date()))().toISOString(),
        layers: step.layers.map((l) => ({ ...l, chunks: { ...l.chunks } })),
      };
      const next = withVersions(step, [...kept, version]);
      deps.step.value = next;
      // Only after the step no longer names them, and only the files nothing else still uses.
      free(dropped, next);
    } catch {
      deps.fail("The version could not be saved. Try again.");
    } finally {
      busy.value = false;
    }
  }

  async function goBack(id: string): Promise<void> {
    const version = versions.value.find((v) => v.id === id);
    if (!version || busy.value || !deps.ready()) return;
    if (deps.hasChanges()) {
      const ok = await deps.confirm(`Go back to ${version.name}? Your changes since the last save are replaced, and Ctrl+Z brings them back.`, { title: "Go back to this?", confirmLabel: "Go back", danger: false });
      if (!ok) return;
    }
    busy.value = true;
    try {
      await deps.restore(version.layers.map((l) => ({ ...l, chunks: { ...l.chunks } })));
    } catch {
      deps.fail("That version could not be loaded. Try again.");
    } finally {
      busy.value = false;
    }
  }

  function rename(id: string, name: string): void {
    const trimmed = name.trim();
    if (trimmed === "") return;
    const step = deps.step.value;
    if (step) deps.step.value = withVersions(step, versions.value.map((v) => (v.id === id ? { ...v, name: trimmed } : v)));
  }

  async function remove(id: string): Promise<void> {
    const version = versions.value.find((v) => v.id === id);
    if (!version) return;
    const ok = await deps.confirm(`Delete ${version.name}? It cannot be brought back.`, { title: "Delete this version?", confirmLabel: "Delete" });
    if (!ok) return;
    const step = deps.step.value;
    if (!step) return;
    const next = withVersions(step, versions.value.filter((v) => v.id !== id));
    deps.step.value = next;
    free([version], next);
  }

  return { versions, cap, busy, canSave, save, goBack, rename, remove };
}
