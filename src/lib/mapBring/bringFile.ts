/** What "Bring a map" takes (#1125 decision 7): pictures, moving maps, and Universal VTT files by their extensions. */
export const BRING_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,video/webm,video/mp4,.dd2vtt,.uvtt,.df2vtt";

/** A Universal VTT file is JSON under one of three extensions; nothing else is read as one. */
export function isUniversalVttName(name: string): boolean {
  return /\.(dd2vtt|uvtt|df2vtt)$/i.test(name);
}

const SIZE_IN_NAME = /[\s_\-([]*\d{1,3}\s*[x×]\s*\d{1,3}[\s_\-)\]]*$/i;

/** A map's starting name from its file: no extension, no trailing "_30x20", underscores read as spaces. */
export function nameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").replace(SIZE_IN_NAME, "");
  return base.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

function megabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${Math.round(mb)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "WebM video · 3840 × 2560 · 48 MB": what the DM chose, in the words of the file panel (frame 06). */
export function describeFile(
  file: Pick<File, "name" | "size">,
  motion: "still" | "animated" | "video" | "vtt",
  natural: { width: number; height: number } | null,
): string {
  const ext = (file.name.split(".").pop() ?? "").toUpperCase();
  const kind =
    motion === "vtt" ? "Universal VTT map" : motion === "video" ? `${ext === "MP4" ? "MP4" : "WebM"} video` : motion === "animated" ? `${ext} animation` : `${ext} picture`;
  const parts = [kind];
  if (natural) parts.push(`${natural.width} × ${natural.height}`);
  parts.push(megabytes(file.size));
  return parts.join(" · ");
}
