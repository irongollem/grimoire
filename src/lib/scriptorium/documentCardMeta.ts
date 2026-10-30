/**
 * The words on a Scriptorium list card (#1115): what it is, and one line that
 * says how it stands. A handout says its paper and who holds it ("Letter · with
 * Pip and Wren", "Notice · not given yet"); a book says its size.
 */
import { describeHolders } from "@/lib/scriptorium/handoutShareSummary";
import { scriptoriumLook } from "@/lib/scriptorium/looks";
import type { ScriptoriumDocumentSummary, ScriptoriumKind } from "@/types/scriptorium.types";

export const KIND_LABELS: Record<ScriptoriumKind, string> = { handout: "Handout", book: "Book" };

type CardDoc = Pick<
  ScriptoriumDocumentSummary,
  "kind" | "theme" | "player_visible_to" | "word_count" | "scriptorium_chapters"
>;

/** "with Pip and Wren", "with the whole party", "not given yet". Holders the active party cannot name are counted. */
function audience(doc: CardDoc, partyNames: ReadonlyMap<string, string>): string {
  const ids = doc.player_visible_to;
  if (ids.length === 0) return "not given yet";
  const names = ids.flatMap((id) => {
    const name = partyNames.get(id);
    return name === undefined ? [] : [name];
  });
  if (names.length < ids.length) return `with ${ids.length} ${ids.length === 1 ? "player" : "players"}`;
  return `with ${describeHolders(names, partyNames.size)}`;
}

export function documentMeta(doc: CardDoc, partyNames: ReadonlyMap<string, string>): string {
  if (doc.kind === "handout") return `${scriptoriumLook(doc.theme).label} · ${audience(doc, partyNames)}`;
  const chapters = doc.scriptorium_chapters[0].count;
  return `${chapters} ${chapters === 1 ? "chapter" : "chapters"} · ${doc.word_count.toLocaleString("en-US")} words`;
}
