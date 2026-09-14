import { pathToFileURL } from "node:url";

/**
 * True when the module at `importMetaUrl` is the script Node was asked to run,
 * as opposed to being imported by a test or another script.
 *
 * `pathToFileURL` rather than `new URL("file://" + argv[1])`: the manual form
 * treats `#`, `%` and `?` in a path as URL syntax, so a checkout under such a
 * directory would never see itself as the entry point and would silently do
 * nothing when run. Two scripts had grown two spellings of this check; this
 * is the one.
 */
export function isCliEntry(importMetaUrl: string): boolean {
  const entry = process.argv[1];
  return typeof entry === "string" && importMetaUrl === pathToFileURL(entry).href;
}
