// Remaps `entityMention` node ids inside a stored Tiptap JSON string after a
// campaign import (backup restore). `useCampaignBackup.ts` gives every
// imported row a new id via `IdMap` and remaps the known FK columns, but rich
// text is opaque client JSON — a mention embedded in a note/NPC lore field/etc.
// still points at the *original* campaign's entity id unless something walks
// the document and rewrites it too. That is what this module does.
//
// Mentions are id-only (the label is resolved at render time), so a stale id
// is a visible "???" chip and a dead "Mentioned in" backlink, not just a
// cosmetic staleness.
import type { IdMap } from "@/lib/campaign/campaignSerialization";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface RemapResult {
  node: unknown;
  changed: boolean;
}

/**
 * Walks a parsed Tiptap document (or any array/object within it) looking for
 * `entityMention` nodes, rewriting `attrs.id` through `idMap` wherever it has
 * an entry. Ids the map does not know about are left exactly as they are —
 * that is every library reference (`srd_owlbear`), the party sentinel
 * (`party-group`), and anything else the backup never assigned a new id to.
 *
 * Returns the original node unchanged (by reference) when nothing needed
 * rewriting, so a caller can tell "nothing changed" from "changed" without a
 * deep-equal.
 */
function remapNode(node: unknown, idMap: IdMap): RemapResult {
  if (Array.isArray(node)) {
    let changed = false;
    const mapped = node.map((child) => {
      const result = remapNode(child, idMap);
      if (result.changed) changed = true;
      return result.node;
    });
    return { node: changed ? mapped : node, changed };
  }

  if (!isRecord(node)) return { node, changed: false };

  let changed = false;
  let next: JsonRecord = node;

  if (node.type === "entityMention" && isRecord(node.attrs)) {
    const id = node.attrs.id;
    if (typeof id === "string" && idMap.has(id)) {
      next = { ...node, attrs: { ...node.attrs, id: idMap.get(id) } };
      changed = true;
    }
    // A backup written before mentions became id-only (20260928233906) still
    // carries each entity's real name as `label`. Restoring it verbatim would
    // put that name back into rows players can read, which is exactly what
    // dropping the attribute was for, so it goes on the way in.
    if (isRecord(next.attrs) && "label" in next.attrs) {
      const { label: _label, ...attrs } = next.attrs;
      next = { ...next, attrs };
      changed = true;
    }
  }

  if (Array.isArray(node.content)) {
    const result = remapNode(node.content, idMap);
    if (result.changed) {
      next = { ...next, content: result.node };
      changed = true;
    }
  }

  return { node: next, changed };
}

/**
 * Rewrites every `entityMention` id inside a stored Tiptap JSON string,
 * re-serializing only when something actually changed. `content` is what the
 * DB column holds verbatim: `null` (no content), a Tiptap JSON string, or —
 * on a legacy plain-text row predating the rich-text editor — arbitrary text
 * that will fail to parse as JSON. Both of the latter two are handled without
 * throwing: a parse failure returns `content` unchanged, since a malformed or
 * legacy row is not this function's problem to fix.
 */
export function remapMentionIds(content: string | null, idMap: IdMap): string | null {
  if (content === null) return content;

  let doc: unknown;
  try {
    doc = JSON.parse(content);
  } catch {
    return content;
  }

  const { node, changed } = remapNode(doc, idMap);
  if (!changed) return content;
  return JSON.stringify(node);
}
