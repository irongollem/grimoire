import { importAbr } from "./abr";
import { importProcreate } from "./procreate";
import { IMPORT_LIMITS, ImportError, type ImportLimits, type ImportOptions, type ImportResult } from "./types";

/*
 * Brush import (#1181): hand it a file's name and bytes and it works out what it is from the bytes
 * (the extension is only a tie-breaker for the message), and returns the brushes it could read plus,
 * for anything it could not, a plain reason. It never throws on a bad file.
 */

type Kind = "abr" | "procreate" | null;

function sniff(bytes: Uint8Array): Kind {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5)) return "procreate";
  if (bytes.length >= 4) {
    const version = (bytes[0] << 8) | bytes[1];
    if (version === 1 || version === 2) return "abr";
    if (version >= 6 && version <= 12 && bytes.length >= 12 && String.fromCharCode(...bytes.subarray(4, 8)) === "8BIM") return "abr";
  }
  return null;
}

export async function importBrushes(
  file: { name: string; bytes: Uint8Array },
  options: ImportOptions = {},
): Promise<ImportResult> {
  const limits: ImportLimits = options.limits ?? IMPORT_LIMITS;
  const fail = (reason: string): ImportResult => ({ brushes: [], skipped: [{ name: file.name, reason }] });
  if (file.bytes.length > limits.maxFileBytes) {
    return fail(`The file is larger than ${Math.round(limits.maxFileBytes / (1024 * 1024))} MB.`);
  }
  const kind = sniff(file.bytes);
  if (kind === null) return fail("This is not an .abr, .brush or .brushset file.");
  try {
    return kind === "abr"
      ? importAbr(file.bytes, limits)
      : importProcreate(file.bytes, limits, options.decodePng);
  } catch (e) {
    if (e instanceof ImportError) return fail(e.message);
    // A decoder the caller supplied may throw its own errors; a bad file must still not take the import down.
    if (e instanceof Error) return fail(`It could not be read (${e.message}).`);
    return fail("It could not be read.");
  }
}
