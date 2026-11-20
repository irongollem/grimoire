import type { BundleEntityKey } from "@/composables/campaign/useWorldBundle";
import type { EntityEmbedType } from "@/lib/tiptap/nodeViewTypes";
import type { EntityRef } from "@/scriptorium/lib/entityEmbeds";

/** Which World Bundle category holds each kind of entity a book can link. */
/** Canon is not World Bundle data (the bundle is rows a player may be handed), so a canon link adds nothing. */
const BUNDLE_KEY_BY_EMBED: Record<Exclude<EntityEmbedType, "canon">, BundleEntityKey> = {
  npc: "npcs",
  monster: "monsters",
  spell: "spells",
  item: "items",
  location: "locations",
  quest: "quests",
  deity: "deities",
  species: "species",
  faction: "factions",
  subclass: "custom_subclasses",
};

/**
 * What "PDF with campaign data" starts with ticked: every entity the book links
 * plus the book's own document. Ids are not checked against the campaign here;
 * the picker drops any it does not offer (a linked shared-library monster is
 * not campaign data).
 */
export function bundlePreselection(
  refs: readonly EntityRef[],
  documentId: string | null,
): Partial<Record<BundleEntityKey, string[]>> {
  const out: Partial<Record<BundleEntityKey, string[]>> = {};
  const add = (key: BundleEntityKey, id: string) => {
    const list = out[key] ?? [];
    if (!list.includes(id)) list.push(id);
    out[key] = list;
  };
  for (const ref of refs) {
    if (ref.type === "canon") continue;
    add(BUNDLE_KEY_BY_EMBED[ref.type], ref.id);
  }
  if (documentId) add("scriptorium_documents", documentId);
  return out;
}
