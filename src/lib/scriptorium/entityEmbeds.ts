/*
 * Pure helpers for the `entityEmbed` Tiptap node (#915 story 3): collecting
 * the entity references a document holds, and turning the placeholder divs
 * in rendered HTML into live, current content.
 *
 * Deliberately entity-shape-agnostic — this module never imports Npc/Monster/
 * etc. types. The caller (useEntityEmbedData) does the fetching and the
 * per-type formatting; this module only knows about {type, id} refs and
 * strings. That split is what keeps this file trivially unit-testable and
 * keeps the DOM-manipulation logic in one place regardless of which entity
 * type is involved.
 */

import type { JSONContent } from "@tiptap/core";
import type { EntityEmbedType, EntityEmbedSize, EntityEmbedAttrs } from "@/lib/tiptap/entityEmbed";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { applyArtChoice, type EntityArtChoice } from "@/lib/scriptorium/entityArt";

export interface EntityRef {
  type: EntityEmbedType;
  id: string;
}

/** Stable map key for a ref — also the key `useEntityEmbedData`'s lookup uses. */
export function entityRefKey(ref: EntityRef): string {
  return `${ref.type}:${ref.id}`;
}

/** Collect the unique entity refs an `entityEmbed` node holds anywhere in a document. */
export function collectEntityRefs(json: JSONContent | null | undefined): EntityRef[] {
  const seen = new Map<string, EntityRef>();

  function walk(node: JSONContent | undefined): void {
    if (!node) return;
    if (node.type === "entityEmbed" && node.attrs) {
      const type = node.attrs.entityType as EntityEmbedType | undefined;
      const id = node.attrs.entityId as string | undefined;
      if (type && id) {
        const ref = { type, id };
        seen.set(entityRefKey(ref), ref);
      }
    }
    node.content?.forEach(walk);
  }

  walk(json ?? undefined);
  return [...seen.values()];
}

/** {type,id} ref key -> the entity's current, formatted body HTML (unsanitized). */
export type EntityEmbedLookup = Record<string, string | undefined>;

const MISSING_LABEL: Record<EntityEmbedType, string> = {
  npc: "This NPC is no longer available.",
  monster: "This monster is no longer available.",
  spell: "This spell is no longer available.",
  item: "This item is no longer available.",
  location: "This location is no longer available.",
  quest: "This quest is no longer available.",
};

/** Visible marker shown in place of an embed whose entity no longer resolves. */
export function missingEntityMarkerHtml(type: EntityEmbedType): string {
  return `<p class="sc-entity-embed-missing">${MISSING_LABEL[type]}</p>`;
}

/**
 * The per-node embed options read off an `entityEmbed` node's `data-*`
 * attributes (or, once #917 story 2 wires it up, its live Tiptap attrs) —
 * everything `applyEmbedNodeOptions` can apply on top of a shared, resolved
 * entity body. Typed from the node attrs' own types (`EntityEmbedSize`,
 * `EntityEmbedAttrs["bandPosition"]`, `EntityArtChoice`) so this module and
 * `entityEmbed.ts` can't drift into two different literal unions for the same
 * option.
 */
export interface EmbedNodeOptions {
  size?: EntityEmbedSize;
  showArt?: boolean;
  showLore?: boolean;
  bandPosition?: EntityEmbedAttrs["bandPosition"];
  art?: EntityArtChoice;
}

/** Reads an `entityEmbed` node's `data-*` attributes off its own element into
 *  `EmbedNodeOptions` — "auto"/absent values map to `undefined` (no override)
 *  everywhere except `art`, which `applyEmbedNodeOptions` always resolves
 *  (defaulting to "auto") since choosing one figure over the other isn't
 *  optional the way overriding a size or lore visibility is. */
export function embedNodeOptionsFromElement(el: Element): EmbedNodeOptions {
  const size = el.getAttribute("data-size");
  const showArt = el.getAttribute("data-show-art");
  const showLore = el.getAttribute("data-show-lore");
  const bandPosition = el.getAttribute("data-band-position");
  const art = el.getAttribute("data-art");
  return {
    size: size === "column" || size === "wide" ? size : undefined,
    showArt: showArt === null ? undefined : showArt !== "false",
    showLore: showLore === null ? undefined : showLore !== "false",
    bandPosition: bandPosition === "bottom" ? "bottom" : undefined,
    art: art === "cutout" || art === "picture" ? art : undefined,
  };
}

/**
 * Applies a node's per-embed options on top of already-injected, shared
 * entity HTML under `root` (the embed's own element, after its innerHTML has
 * been set to the resolved body). Pulled out of `resolveEntityEmbeds` (#917
 * story 1) so the same per-node step can run again from `EntityEmbedView`'s
 * live node view once it stops relying on the document's own resolved HTML
 * (#917 story 2) — the options themselves come from the node's Tiptap attrs
 * there rather than from `data-*`, hence the plain `EmbedNodeOptions` input
 * rather than an `Element` to read attributes from.
 *
 * The node's own `data-size` (#915 story 6) overrides the stat block's
 * "auto" size when it's an explicit "column"/"wide": the formatted body HTML
 * a ref resolves to is shared by every embed of that entity (the lookup is
 * keyed by entity identity, not by node), so per-node sizing is applied here,
 * after injection, by swapping the resolved `.sc-statblock`'s (and its
 * surrounding `.sc-statblock-entry`'s — #915 story 6 round 2) own size class
 * rather than by formatting the body differently per node. `data-show-art`
 * is handled the same way: when it's explicitly "false", the resolved art
 * figures (`.sc-entity-art`, scriptoriumImport.ts / entityArt.ts) are removed
 * after injection — again because the lookup's formatted HTML is shared
 * across every embed of that entity and can't itself vary per node.
 *
 * When art isn't hidden outright, `art` (#917 story 1) decides WHICH of the
 * (up to two) resolved figures survives — a monster's body HTML carries both
 * `data-art-kind="picture"` and `data-art-kind="cutout"` figures when both
 * exist, and `applyArtChoice` (entityArt.ts) trims that down to the one this
 * node wants, per parent element, falling back to the other kind when the
 * forced one doesn't exist. This always runs (defaulting to "auto") rather
 * than only on an explicit override, because unlike size/lore there is no
 * "as formatted" state to leave alone — the formatter always emits every
 * image it has.
 *
 * `data-show-lore` and `data-band-position` (#915 story 6 round 2) follow the
 * same per-node-after-injection pattern: "false" lore removes the entry's
 * lore text and hides its heading (the same "no lore" treatment the formatter
 * itself applies when the entity simply has no description — see
 * scriptoriumImport.ts), and a "bottom" band position flips the entry's
 * `data-band-position` attribute, which the paged stylesheet reads to reorder
 * a WIDE entry's band vs its art/lore (no-op on a column entry's two-cell
 * grid).
 */
export function applyEmbedNodeOptions(root: Element, opts: EmbedNodeOptions): void {
  if (opts.size === "column" || opts.size === "wide") {
    root.querySelectorAll(".sc-statblock").forEach((block) => {
      block.classList.remove("sc-statblock--column", "sc-statblock--wide");
      block.classList.add(`sc-statblock--${opts.size}`);
    });
    root.querySelectorAll(".sc-statblock-entry").forEach((entry) => {
      entry.classList.remove("sc-statblock-entry--column", "sc-statblock-entry--wide");
      entry.classList.add(`sc-statblock-entry--${opts.size}`);
    });
  }

  if (opts.showArt === false) {
    root.querySelectorAll(".sc-entity-art").forEach((art) => art.remove());
  } else {
    applyArtChoice(root, opts.art ?? "auto");
  }

  if (opts.showLore === false) {
    root.querySelectorAll(".sc-statblock-entry-lore").forEach((lore) => lore.remove());
    root.querySelectorAll(".sc-statblock-entry-heading").forEach((heading) =>
      heading.classList.add("sc-statblock-entry-heading--no-lore"),
    );
  }

  if (opts.bandPosition === "bottom") {
    root.querySelectorAll(".sc-statblock-entry").forEach((entry) =>
      entry.setAttribute("data-band-position", "bottom"),
    );
  }
}

/**
 * Replace every `entityEmbed` placeholder div in a rendered HTML string with
 * its entity's current, sanitized content — or the missing-entity marker when
 * the lookup has nothing for it (deleted entity, or a fetch still in flight
 * with no cached data yet).
 *
 * Mutates the matched elements' `innerHTML` in place rather than rebuilding
 * them, so `data-block-id` (furniture anchors, click-to-edit) and any other
 * attribute the node carries survive untouched — only the two data-entity-*
 * attributes are ever read. The per-node options (size/art/lore/band — see
 * `applyEmbedNodeOptions`'s own doc) are read straight off the node's
 * `data-*` attributes via `embedNodeOptionsFromElement` and applied after
 * injection.
 */
export function resolveEntityEmbeds(html: string, lookup: EntityEmbedLookup): string {
  if (!html.includes('data-type="entity-embed"')) return html;

  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll('[data-type="entity-embed"]').forEach((el) => {
    const type = el.getAttribute("data-entity-type") as EntityEmbedType | null;
    const id = el.getAttribute("data-entity-id");
    if (!type || !id) return;
    const raw = lookup[entityRefKey({ type, id })];
    el.innerHTML = sanitizeHtml(raw ?? missingEntityMarkerHtml(type));

    applyEmbedNodeOptions(el, embedNodeOptionsFromElement(el));
  });
  return container.innerHTML;
}

/** The JSON content of a new document created straight from a linked entity
 *  ("Send to Scriptorium"): the live embed alone. No title heading of its
 *  own, because every entity's formatted body already opens with the
 *  entity's name, and a second one printed the name twice. Every such call
 *  site shares this so a document created this way is never a one-time HTML
 *  snapshot (#915 story 3).
 *
 *  `startsPage` defaults true for a monster (a Monster Manual entry starts
 *  its own page) and false for everything else — the DM flips it per node
 *  afterwards for a creature-family variant that should share its first
 *  entry's page(s) (see entityEmbed.ts). */
export function buildEntityEmbedDocumentJson(entityType: EntityEmbedType, entityId: string): JSONContent {
  return {
    type: "doc",
    content: [
      { type: "entityEmbed", attrs: { entityType, entityId, startsPage: entityType === "monster" } },
    ],
  };
}

/** Stringified form: what `scriptorium_documents.content` actually stores. */
export function buildEntityEmbedDocumentContent(entityType: EntityEmbedType, entityId: string): string {
  return JSON.stringify(buildEntityEmbedDocumentJson(entityType, entityId));
}
