import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { ItemRarity } from "@/types/item.types";

/**
 * The Packs search (#1112): which rows match, and the one-line-per-thing answer to
 * "who has it?". Pure, so the Party page only wires it.
 */

export interface PackFilters {
  query: string;
  attuned: boolean;
  magic: boolean;
  cursed: boolean;
}

export interface PackSearchContext {
  /** The catalogue rarity behind a row, or null when it has no catalogue entry. */
  rarityOf: (row: PartyInventoryItem) => ItemRarity | null;
  isCursed: (row: PartyInventoryItem) => boolean;
}

export interface PackOwner {
  id: string;
  name: string;
}

export interface AnswerLine {
  /** Lower-cased name the rows were grouped by. */
  key: string;
  name: string;
  total: number;
  /** "Ilse ×2, belt", one per carrier and place. */
  where: string[];
}

export interface PackSearchResult {
  active: boolean;
  matchIds: ReadonlySet<string>;
  lines: AnswerLine[];
  /** Matching things, counting each of a stack. */
  things: number;
  /** Packs holding at least one match. */
  packs: number;
  /** Every pack there is: the stash and each member. */
  totalPacks: number;
}

export function isSearchActive(f: PackFilters): boolean {
  return f.query.trim() !== "" || f.attuned || f.magic || f.cursed;
}

/** Catalogue rarities that are not magic: a rope is not a magic item. */
const NOT_MAGIC: ReadonlySet<ItemRarity> = new Set<ItemRarity>(["mundane", "common"]);

/** Name or notes contain the query, ignoring case; notes may be a tiptap document. */
export function matchesText(row: Pick<PartyInventoryItem, "name" | "notes">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return row.name.toLowerCase().includes(q) || tiptapToPlainText(row.notes).toLowerCase().includes(q);
}

/** Every active condition must hold: the query and each chip narrow together. */
export function rowMatches(row: PartyInventoryItem, f: PackFilters, ctx: PackSearchContext): boolean {
  if (!matchesText(row, f.query)) return false;
  if (f.attuned && !row.is_attuned) return false;
  if (f.magic) {
    const rarity = ctx.rarityOf(row);
    if (rarity === null || NOT_MAGIC.has(rarity)) return false;
  }
  if (f.cursed && !ctx.isCursed(row)) return false;
  return true;
}

/** Splits a name around the query so the match can be marked. */
export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const parts: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, at)) {
    if (i > at) parts.push({ text: text.slice(at, i), hit: false });
    parts.push({ text: text.slice(i, i + q.length), hit: true });
    at = i + q.length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: false });
  return parts.length > 0 ? parts : [{ text, hit: false }];
}

function firstName(name: string): string {
  const [first] = name.trim().split(/\s+/);
  return first || name;
}

/** Where in a pack a row sits, in the words the DM would use. */
export function wherePhrase(row: PartyInventoryItem, rows: readonly PartyInventoryItem[]): string {
  switch (row.location) {
    case "equipped":
      return row.is_attuned ? "worn and attuned" : "worn";
    case "belt":
      return "belt";
    case "backpack":
      return "backpack";
    case "container": {
      const holder = rows.find((r) => r.id === row.container_id && r.is_container);
      return holder ? `in the ${holder.name}` : "stored elsewhere";
    }
    case "stored":
      return "stored elsewhere";
  }
}

export function runPackSearch(
  rows: readonly PartyInventoryItem[],
  members: readonly PackOwner[],
  filters: PackFilters,
  ctx: PackSearchContext,
): PackSearchResult {
  const active = isSearchActive(filters);
  const totalPacks = members.length + 1;
  if (!active) return { active, matchIds: new Set(), lines: [], things: 0, packs: 0, totalPacks };

  const rank = new Map<string | null, number>([[null, 0]]);
  members.forEach((m, i) => rank.set(m.id, i + 1));
  const names = new Map(members.map((m) => [m.id, firstName(m.name)] as const));

  const matched = rows
    .filter((r) => rowMatches(r, filters, ctx))
    .sort((a, b) => (rank.get(a.carried_by) ?? 99) - (rank.get(b.carried_by) ?? 99));

  const groups = new Map<string, { name: string; total: number; where: Map<string, { who: string; qty: number; phrase: string }> }>();
  for (const r of matched) {
    const key = r.name.trim().toLowerCase();
    const group = groups.get(key) ?? { name: r.name, total: 0, where: new Map() };
    group.total += r.quantity;
    const who = r.carried_by === null ? "the stash" : (names.get(r.carried_by) ?? "someone");
    // The stash is its own place; a member's pack is told by the spot in it.
    const phrase = r.carried_by === null ? "" : wherePhrase(r, rows);
    const at = `${r.carried_by ?? "stash"}|${phrase}`;
    const seen = group.where.get(at);
    if (seen) seen.qty += r.quantity;
    else group.where.set(at, { who, qty: r.quantity, phrase });
    groups.set(key, group);
  }

  const lines = [...groups.entries()]
    .map(([key, g]): AnswerLine => ({
      key,
      name: g.name,
      total: g.total,
      where: [...g.where.values()].map(({ who, qty, phrase }) => {
        const head = qty > 1 ? `${who} ×${qty}` : who;
        return phrase ? `${head}, ${phrase}` : head;
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    active,
    matchIds: new Set(matched.map((r) => r.id)),
    lines,
    things: matched.reduce((n, r) => n + r.quantity, 0),
    packs: new Set(matched.map((r) => r.carried_by)).size,
    totalPacks,
  };
}

/** "3 things, in 2 packs. Nobody else has any." */
export function answerSentence(result: PackSearchResult): string {
  if (result.things === 0) return "Nothing in any pack matches.";
  const things = `${result.things} ${result.things === 1 ? "thing" : "things"}`;
  const packs = `${result.packs} ${result.packs === 1 ? "pack" : "packs"}`;
  const rest = result.packs < result.totalPacks ? " Nobody else has any." : "";
  return `${things}, in ${packs}.${rest}`;
}
