/** "23 Oct" for a release's date. */
export function formatReleaseDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
