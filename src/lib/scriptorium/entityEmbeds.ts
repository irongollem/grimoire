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
import type { EntityEmbedType } from "@/lib/tiptap/entityEmbed";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

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
 * Replace every `entityEmbed` placeholder div in a rendered HTML string with
 * its entity's current, sanitized content — or the missing-entity marker when
 * the lookup has nothing for it (deleted entity, or a fetch still in flight
 * with no cached data yet).
 *
 * Mutates the matched elements' `innerHTML` in place rather than rebuilding
 * them, so `data-block-id` (furniture anchors, click-to-edit) and any other
 * attribute the node carries survive untouched — only the two data-entity-*
 * attributes are ever read.
 *
 * The node's own `data-size` (#915 story 6) overrides the stat block's
 * "auto" size when it's an explicit "column"/"wide": the formatted body HTML
 * a ref resolves to is shared by every embed of that entity (the lookup is
 * keyed by entity identity, not by node), so per-node sizing is applied here,
 * after injection, by swapping the resolved `.sc-statblock`'s own size class
 * rather than by formatting the body differently per node. `data-show-art`
 * is handled the same way: when it's explicitly "false", the resolved art
 * figure (`.sc-entity-art`, scriptoriumImport.ts) is removed after injection
 * — again because the lookup's formatted HTML is shared across every embed
 * of that entity and can't itself vary per node.
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

    const size = el.getAttribute("data-size");
    if (size === "column" || size === "wide") {
      el.querySelectorAll(".sc-statblock").forEach((block) => {
        block.classList.remove("sc-statblock--column", "sc-statblock--wide");
        block.classList.add(`sc-statblock--${size}`);
      });
    }

    if (el.getAttribute("data-show-art") === "false") {
      el.querySelectorAll(".sc-entity-art").forEach((art) => art.remove());
    }
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
