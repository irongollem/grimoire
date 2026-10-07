/**
 * Browser `File`s to the reader's input. A file picked from a folder carries
 * its path in `webkitRelativePath` (`Vault/NPCs/Mara.md`); a loose file or a
 * zip has only its name. The reader expects the path in `name`.
 */
import type { ArchiveInputFile } from "./types";

type PickedFile = Pick<File, "name" | "arrayBuffer"> & { webkitRelativePath?: string };

export async function filesToArchiveInput(files: readonly PickedFile[]): Promise<ArchiveInputFile[]> {
  return Promise.all(
    files.map(async (file) => ({
      name: file.webkitRelativePath ? file.webkitRelativePath : file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );
}

/** What to call the import: the zip's name, the picked folder's name, or a plural for loose files. */
export function archiveDisplayName(files: readonly Pick<PickedFile, "name" | "webkitRelativePath">[]): string {
  if (files.length === 0) return "Wiki export";
  const first = files[0];
  if (first.webkitRelativePath) return first.webkitRelativePath.split("/")[0] || "Wiki export";
  if (files.length === 1) return first.name.replace(/\.(zip|md|markdown|html?|json)$/i, "");
  return `${files.length} exported pages`;
}
