/*
 * Entity-agnostic art rendering for Scriptorium book entries (#917 story 1).
 *
 * A game entity can carry up to two images: "the picture" (a portrait, on
 * whatever background it was made with) and "the cutout" (the creature/figure
 * alone on a transparent background, meant to sit directly on the page rather
 * than in a framed box). Monsters gain both fields first; NPCs are meant to
 * reuse this same module later, which is why nothing here imports Monster or
 * any other entity type — it only knows about two optional image URLs and an
 * alt string.
 *
 * The formatter (scriptoriumImport.ts) always emits BOTH figures when both
 * URLs exist, each tagged with `data-art-kind`. Which one actually shows is
 * decided later, per embed node, by `applyArtChoice` — the same "shared HTML,
 * per-node choice" pattern `resolveEntityEmbeds` already uses for size/lore/
 * band (see entityEmbeds.ts's header comment): the formatted body HTML is
 * shared by every embed of the same entity, so a per-node "auto"/"cutout"/
 * "picture" choice can't be baked into the formatter's output.
 */

import { escapeHtml } from "@/lib/escapeHtml";

/** Which image a linked stat block shows. "auto" prefers the cutout when the
 *  entity has one and falls back to the picture, so a book improves as
 *  cutouts are added without the author touching each entry. */
export type EntityArtChoice = "auto" | "cutout" | "picture";

export const ENTITY_ART_CHOICES: readonly EntityArtChoice[] = ["auto", "cutout", "picture"];

export interface EntityArtFiguresInput {
  /** "The picture" — a portrait/profile image, whatever its background. */
  picture: string | null;
  /** "The cutout" — the creature/figure alone on a transparent background. */
  cutout: string | null;
  alt: string;
}

/**
 * Up to two `<img>` tags, one per available image, each carrying a stable
 * `data-art-kind` hook. No inline sizing — that lives in theme-base.css's
 * `.sc-entity-art--picture` / `.sc-entity-art--cutout` rules, since a cutout
 * is meant to run larger and frameless while a picture keeps its printed
 * border. Returns "" when neither image exists, so callers can skip building
 * an aside cell at all (mirrors the old single-image behaviour).
 */
export function entityArtFiguresHtml({ picture, cutout, alt }: EntityArtFiguresInput): string {
  const safeAlt = escapeHtml(alt);
  let html = "";
  if (picture) {
    html += `<img src="${escapeHtml(picture)}" class="sc-entity-art sc-entity-art--picture" data-art-kind="picture" alt="${safeAlt}" />\n`;
  }
  if (cutout) {
    html += `<img src="${escapeHtml(cutout)}" class="sc-entity-art sc-entity-art--cutout" data-art-kind="cutout" alt="${safeAlt}" />\n`;
  }
  return html;
}

/** Preference order per choice: the first kind found wins, the second is the
 *  fallback when a forced choice has no image of that kind (a DM who forces
 *  "cutout" on a creature with only a picture still sees art, not nothing). */
const PREFERENCE: Record<EntityArtChoice, readonly ["cutout" | "picture", "cutout" | "picture"]> = {
  auto: ["cutout", "picture"],
  cutout: ["cutout", "picture"],
  picture: ["picture", "cutout"],
};

/**
 * Among the `[data-art-kind]` figures under `root`, keeps exactly one per
 * parent element (the preferred kind, falling back to the other when the
 * preferred one isn't present) and removes the rest. A no-op when a parent
 * has no art figures at all.
 */
export function applyArtChoice(root: ParentNode, choice: EntityArtChoice): void {
  const [preferred, fallback] = PREFERENCE[choice];
  const parents = new Set<Element>();
  root.querySelectorAll("[data-art-kind]").forEach((el) => {
    if (el.parentElement) parents.add(el.parentElement);
  });

  parents.forEach((parent) => {
    const figures = Array.from(parent.querySelectorAll(":scope > [data-art-kind]")) as Element[];
    if (figures.length === 0) return;
    const keep =
      figures.find((el) => el.getAttribute("data-art-kind") === preferred) ??
      figures.find((el) => el.getAttribute("data-art-kind") === fallback);
    figures.forEach((el) => {
      if (el !== keep) el.remove();
    });
  });
}
