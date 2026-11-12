/*
 * Importing a brush file (#1181): read it in a worker, save what it held to Yours under the file's name, and
 * keep a report for the result dialog. Saving is handed in, so this knows nothing of the table.
 */
import { ref } from "vue";
import { runImport } from "./brushes/runImport";
import { importedBrushName, setNameFromFile } from "./brushes/userBrushes";
import type { BrushPreset } from "./engine/types";
import type { ImportResult, SkippedBrush } from "./import/types";
import type { NewBrush } from "./useUserBrushes";

export interface ImportReport {
  fileName: string;
  /** What the file brought into Yours. */
  added: number;
  skipped: SkippedBrush[];
  /** Brushes that came in with settings that did not carry over, and what those were. */
  notes: { name: string; notes: string[] }[];
  /** Set when the brushes could not be saved; nothing was added then. */
  error: string | null;
}

export function useBrushImport(
  save: (items: NewBrush[]) => Promise<BrushPreset[]>,
  run: (name: string, bytes: Uint8Array) => Promise<ImportResult> = runImport,
) {
  const busy = ref(false);
  const report = ref<ImportReport | null>(null);

  async function importFile(file: File): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    const base = { fileName: file.name, skipped: [] as SkippedBrush[], notes: [] as ImportReport["notes"] };
    try {
      const result = await run(file.name, new Uint8Array(await file.arrayBuffer()));
      const setName = setNameFromFile(file.name);
      const source = file.name.toLowerCase().endsWith(".abr") ? "abr" : "procreate";
      const brushes = result.brushes.map((b) => ({ ...b, preset: { ...b.preset, name: importedBrushName(b.preset.name, setName) } }));
      const items: NewBrush[] = brushes.map((b) => ({ preset: b.preset, tip: b.tip, grain: b.grain, source, setName }));
      const notes = brushes.filter((b) => b.notes.length > 0).map((b) => ({ name: b.preset.name, notes: b.notes }));
      try {
        const saved = items.length > 0 ? await save(items) : [];
        report.value = { ...base, added: saved.length, skipped: result.skipped, notes, error: null };
      } catch (e) {
        report.value = { ...base, added: 0, skipped: result.skipped, notes: [], error: e instanceof Error ? e.message : "The brushes could not be saved." };
      }
    } catch (e) {
      report.value = { ...base, added: 0, error: e instanceof Error ? e.message : "The file could not be read." };
    } finally {
      busy.value = false;
    }
  }

  return { busy, report, importFile, dismiss: () => (report.value = null) };
}
