/**
 * Split the Chronicler's proposed tags off a generated chronicle, and
 * reconcile them against the campaign's existing tag vocabulary.
 *
 * Companion to chronicleHeading.ts's title/session extraction: the system
 * prompt asks the model to end its markdown with one line naming a few tags
 * for the note's tag bar --
 *
 *   [[tags: icewind dale, council of speakers, frostbite]]
 *
 * -- and that line has to come out of the note body the same way the title
 * heading does, before either reaches the DM. Pure, and colocated with the
 * other `resolveGenerated*`/`parseChronicle*` post-processors for the same
 * reason: what a model appends is a guess, and a guess belongs somewhere a
 * test can pin it.
 */

import { normalizeTag } from "@/lib/tags";

/** Most tags a single generation is allowed to propose, after reconciliation. */
const MAX_TAGS = 8;

/** `[[tags: a, b, c]]` on its own line, tolerant of extra whitespace and case. */
const TAGS_LINE = /^\s*\[\[\s*tags\s*:\s*([^\]]*)\]\]\s*$/i;

export interface ParsedChronicleTags {
  /** Raw, comma-split, trimmed, non-empty tags in the order the model wrote them. */
  tags: string[];
  /** The markdown with the tags line (and any blank lines it leaves trailing) removed. */
  body: string;
}

export function parseChronicleTags(markdown: string): ParsedChronicleTags {
  const lines = markdown.split("\n");
  const tags: string[] = [];
  const keptLines: string[] = [];
  let foundLine = false;

  for (const line of lines) {
    const match = line.match(TAGS_LINE);
    if (!match) {
      keptLines.push(line);
      continue;
    }
    foundLine = true;
    for (const raw of match[1].split(",")) {
      const trimmed = raw.trim();
      if (trimmed) tags.push(trimmed);
    }
  }

  // No tags line found at all — leave the input completely alone, same as
  // parseChronicleHeading's "nothing to parse" case. An empty `[[tags: ]]`
  // line is still a tags line, and still comes out of the body.
  if (!foundLine) return { tags: [], body: markdown };

  // The tags line is usually the very last line, so removing it usually
  // leaves a trailing run of blank lines behind.
  while (keptLines.length && keptLines[keptLines.length - 1].trim() === "") {
    keptLines.pop();
  }

  return { tags, body: keptLines.join("\n") };
}

/**
 * Reconcile the model's proposed tags against the campaign's existing tag
 * vocabulary. Stored tags are spelled inconsistently -- older rows have
 * spaces ("icewind dale"), TagInput-made ones have hyphens ("icewind-dale")
 * -- so a proposed tag that already exists (by normalized form) is rewritten
 * to the EXISTING spelling rather than a freshly normalized one, to avoid
 * minting a second tag that means the same thing. A genuinely new tag is
 * normalized the way TagInput would normalize it if the DM had typed it.
 */
export function reconcileChronicleTags(proposed: string[], existing: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const candidate of proposed) {
    const normalized = normalizeTag(candidate);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    const existingSpelling = existing.find((tag) => normalizeTag(tag) === normalized);
    result.push(existingSpelling ?? normalized);

    if (result.length >= MAX_TAGS) break;
  }

  return result;
}
