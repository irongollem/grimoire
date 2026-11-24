/** One suggested line and whether the disguise check flagged it (#1061). */
export interface VoiceLine {
  text: string;
  reveals: boolean;
}

export const MAX_LINES = 3;

/**
 * The coach's lines from a reply. The edge function sends `{ text, reveals }`;
 * the in-browser path (and a deploy older than the disguise check) sends bare
 * strings or objects with no `reveals`. Absence means "not judged", so it
 * narrows to false here, at the parse boundary, rather than being guessed later.
 */
export function parseVoiceLines(raw: unknown): VoiceLine[] {
  if (!Array.isArray(raw)) return [];
  const out: VoiceLine[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      out.push({ text: item, reveals: false });
    } else if (typeof item === "object" && item !== null && "text" in item && typeof item.text === "string") {
      out.push({ text: item.text, reveals: "reveals" in item && item.reveals === true });
    }
  }
  return out
    .map((l) => ({ ...l, text: l.text.trim() }))
    .filter((l) => l.text.length > 0)
    .slice(0, MAX_LINES);
}
