/**
 * A tie a generator is asked to make with the record it creates (the maintainer's rule: any sort of linking must be
 * possible from the generators). The record does not exist yet when the tie is chosen, so it is kept as a pending
 * tie: the existing record at the far end and the catalogue choice READ FROM THE NEW RECORD ("worships" Auril). The
 * generator writes it once the record is saved (`useApplyGeneratorLinks`).
 */
import type { LinkKind } from "@edge-shared/worldLinkCatalogue.ts";
import type { TypeChoice } from "@/lib/worldLinks/connections";

export interface GeneratorLink {
  /** The existing record at the far end. */
  kind: LinkKind;
  id: string;
  name: string;
  /** What the NEW record is to it; `subjectIsFrom` says whether the new record is stored as the link's `from`. */
  choice: TypeChoice;
}

/** "Worships · Auril": a chip. */
export function linkChipLabel(link: Pick<GeneratorLink, "name" | "choice">): string {
  const word = link.choice.word;
  return `${word.charAt(0).toUpperCase()}${word.slice(1)} · ${link.name}`;
}

/** "worships Auril": one clause of the line the model is given so what it writes agrees with the tie. */
export function linkClause(link: Pick<GeneratorLink, "name" | "choice">): string {
  return `${link.choice.word} ${link.name}`;
}

/** The same tie twice (one record, one choice) is one tie. */
export function sameLink(a: GeneratorLink, b: GeneratorLink): boolean {
  return a.kind === b.kind && a.id === b.id && a.choice.key === b.choice.key && a.choice.subjectIsFrom === b.choice.subjectIsFrom;
}

/** The line of constraints for the model: "Ties: worships Auril; works at The Docks", or null for none. */
export function linksContextLine(links: readonly GeneratorLink[]): string | null {
  return links.length === 0 ? null : `Ties: ${links.map(linkClause).join("; ")}`;
}
