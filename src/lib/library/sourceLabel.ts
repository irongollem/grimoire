/**
 * What a row's source is called on screen, wherever it is shown: a card's
 * badge, a list row's tag, a sheet's header line, a read-only banner, a filter
 * option. One rule, so a book reads the same in the Bestiary as in Dungeon Craft.
 *
 * A library row names its book by `content_sources` key, and the book's title in
 * that table is the truth (a title copied onto a row, or into a campaign's
 * enabled-source snapshot, can be older than a rename). A DM's own row may carry
 * a source they typed themselves ("Monster Manual"), which is shown as written.
 * A row with no source shows nothing: there is no generic word for "shared" or
 * "own" content, because the book's name already says which it is.
 */

/** The `source` AI drafting writes into an own row. A marker, not a book: the
 *  AI label says the same thing in its own place, so it is never shown as one. */
export const AI_DRAFT_SOURCE = "Grimoire:AI";

// Human-readable labels for open5e document slugs, used only as a fallback when
// neither `content_sources` nor the row knows a title. The authoritative
// per-source title, publisher and licence live in the `content_sources` table
// (see the Licences tab in the Reliquary); these labels must never contradict
// it. Getting a label wrong misattributes one publisher's work to another,
// which is the exact thing the OGL and CC-BY attribution terms forbid, so
// correct this map rather than papering over it downstream.
export const OPEN5E_SOURCE_LABELS: Record<string, string> = {
  // Wizards of the Coast — CC-BY-4.0 (5.1 additionally OGL 1.0a)
  "srd-2014": "System Reference Document 5.1",
  "srd-2024": "System Reference Document 5.2",
  "wotc-srd": "System Reference Document 5.1",
  // Kobold Press — OGL 1.0a, except the Black Flag SRD (CC-BY-4.0)
  "blackflag": "Black Flag SRD",
  "cc": "Creature Codex",
  "tob": "Tome of Beasts",
  "tob2": "Tome of Beasts 2",
  "tob3": "Tome of Beasts 3",
  "tob-2023": "Tome of Beasts 2023",
  "toh": "Tome of Heroes",
  "dmag": "Deep Magic",
  "dmag-e": "Deep Magic Extended",
  "vom": "Vault of Magic",
  "warlock": "Warlock Archives",
  "kp": "Kobold Press Compilation",
  // EN Publishing (Level Up: Advanced 5th Edition) — OGL 1.0a.
  // NOT a Kobold Press title: this slug was previously mislabelled "Tome of
  // Beasts: Lairs", crediting the wrong publisher entirely.
  "menagerie": "Level Up: Monstrous Menagerie",
  "a5e": "Level Up: Adventurer's Guide",
  // Open5e's own content — OGL 1.0a
  "o5e": "Open5e Originals",
  // Green Ronin Publishing
  "taldorei": "Tal'Dorei Campaign Setting",
  // Books we do not host: these appear only on content a DM imported themselves.
  "phb": "Player's Handbook",
  "xge": "Xanathar's Guide to Everything",
  "tce": "Tasha's Cauldron of Everything",
  "ai": "Acquisitions Incorporated",
  "srd": "SRD (legacy)",
};

/**
 * The label for a row's source, or null when it has none worth naming.
 *
 * @param source the row's `source`: a `content_sources` key, an Open5e slug, or free text
 * @param storedTitle a title the row (or a snapshot) carries, used when the key is not a known book
 * @param titles `content_sources` titles by key
 */
export function sourceLabel(
  source: string | null | undefined,
  storedTitle: string | null | undefined,
  titles: ReadonlyMap<string, string>,
): string | null {
  const key = source?.trim();
  if (!key || key === AI_DRAFT_SOURCE) return null;
  const stored = storedTitle?.trim();
  return titles.get(key) ?? (stored ? stored : undefined) ?? OPEN5E_SOURCE_LABELS[key] ?? key;
}
