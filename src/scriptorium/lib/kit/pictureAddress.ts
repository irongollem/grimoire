/** A picture's web address as the page will load it: http or https only, trimmed; anything else is null. */
export function webPictureAddress(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
