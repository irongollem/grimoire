// Ask Grimoire (#1253): the words a model uses for what a NEW record is to an existing one, for the generic `links`
// input every generator can take (the maintainer's rule: any sort of linking must be possible from the generators).
//
// One word per catalogue choice, read from the new record, so a word maps to exactly one `TypeChoice`: the choice's
// own wording with spaces as underscores ("works at" is `works_at`, "apprentice of" is `apprentice_of`, "protégé of"
// is `protege_of`). Never a key plus a direction flag, because the key alone is ambiguous between two people ("mentor
// of" and "apprentice of" share `mentor_of`). Kin is left out: family has its own table, its own birth-year checks
// and its own input (`relation` on an NPC), and a quest's own records are written by the quest.
// Pure and shared: the server validates a proposal with it, the browser resolves the word back to the choice.

import { LINK_KINDS, typeChoices, type LinkKind, type TypeChoice } from "../worldLinkCatalogue.ts";

/** The most links one proposal may carry: a handful of ties, not the whole campaign. */
export const LINKS_MAX = 8;

/** One tie as the model gives it: the existing record and what the NEW record is to it. */
export interface AskLink {
  kind: LinkKind;
  id: string;
  relation: string;
}

export function isLinkKind(value: unknown): value is LinkKind {
  return typeof value === "string" && (LINK_KINDS as readonly string[]).includes(value);
}

/** "works at" is `works_at`; accents fold ("protégé of" is `protege_of`). */
export function relationWord(choice: Pick<TypeChoice, "word">): string {
  return choice.word.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** What a new record of `subject` kind can be to an existing record of `other` kind, in catalogue order. */
export function linkChoices(subject: LinkKind, other: LinkKind): TypeChoice[] {
  return typeChoices(subject, other).filter((c) => c.home !== "kin");
}

export function relationWords(subject: LinkKind, other: LinkKind): string[] {
  return linkChoices(subject, other).map(relationWord);
}

/** The one choice a word stands for between two kinds, or null when the pair does not hold it. */
export function choiceForRelation(subject: LinkKind, other: LinkKind, word: string): TypeChoice | null {
  const wanted = word.trim().toLowerCase();
  return linkChoices(subject, other).find((c) => relationWord(c) === wanted) ?? null;
}

/** The kinds a new `subject` can be tied to at all, among `kinds`. */
export function linkableKinds(subject: LinkKind, kinds: readonly LinkKind[]): LinkKind[] {
  return kinds.filter((k) => linkChoices(subject, k).length > 0);
}
