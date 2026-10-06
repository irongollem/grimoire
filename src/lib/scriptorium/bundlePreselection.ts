import type { BundleEntityKey } from "@/composables/campaign/useWorldBundle";
import type { EntityEmbedType } from "@/lib/tiptap/entityEmbed";
import type { EntityRef } from "@/lib/scriptorium/entityEmbeds";

/** Which World Bundle category holds each kind of entity a book can link. */
const BUNDLE_KEY_BY_EMBED: Record<EntityEmbedType, BundleEntityKey> = {
  npc: "npcs",
  monster: "monsters",
  spell: "spells",
  item: "items",
  location: "locations",
  quest: "quests",
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
  for (const ref of refs) add(BUNDLE_KEY_BY_EMBED[ref.type], ref.id);
  if (documentId) add("scriptorium_documents", documentId);
  return out;
}
