/**
 * What the canon already holds, as a short digest every canon helper reads beside its own lists (#1282). The world block
 * carries only the premise and the truths known to all; without this, a helper drafting forces never saw the arcs, and a
 * backstory never saw the secrets, so "Design it with me" did not get deeper as the DM filled it in. The canon helpers are
 * the DM's alone, so the digest reads every part, secrets included; a player never reaches one.
 *
 * One line per entry, `part: title: start of its text`, grouped by part in the book's order, capped so a large canon stays
 * cheap. The premise is left out: the world block already carries it whole.
 */

/** The parts in the book's order, with the word a line is led by. */
const PART_LABEL: ReadonlyArray<readonly [part: string, label: string]> = [
  ["truth", "Truth"],
  ["lore", "Lore"],
  ["force", "Force"],
  ["secret", "Secret"],
  ["question", "Open question"],
  ["backstory", "Backstory"],
];

export const DIGEST_MAX_ENTRIES = 120;
export const DIGEST_EXCERPT_CHARS = 220;

export interface DigestEntry {
  part: string;
  title: string;
  /** The entry's text, already plain (mentions named, secret blocks kept: the reader is the DM's helper). */
  text: string;
  /** A force that ended, a question answered: said so, since a helper should not build on it as still open. */
  closed: boolean;
}

export interface DigestArc {
  name: string;
  question: string | null;
  status: string;
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** The digest's lines, or an empty list when the canon holds nothing beyond its premise. */
export function canonDigestLines(entries: readonly DigestEntry[], arcs: readonly DigestArc[]): string[] {
  const lines: string[] = [];
  for (const arc of arcs) {
    const question = arc.question ? oneLine(arc.question) : "";
    lines.push(`Arc (${arc.status}): ${oneLine(arc.name)}${question !== "" ? `: asks ${question}` : ""}`);
  }
  let kept = 0;
  for (const [part, label] of PART_LABEL) {
    for (const e of entries) {
      if (e.part !== part || kept >= DIGEST_MAX_ENTRIES) continue;
      const title = oneLine(e.title);
      const text = oneLine(e.text).slice(0, DIGEST_EXCERPT_CHARS);
      if (title === "" && text === "") continue;
      kept += 1;
      lines.push(`${label}${e.closed ? " (closed)" : ""}: ${title}${text !== "" && text !== title ? `: ${text}` : ""}`);
    }
  }
  return lines;
}
