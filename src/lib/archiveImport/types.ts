/**
 * The contract of the wiki-archive import (#932, story 6): what reading a
 * LegendKeeper / World Anvil / Obsidian export (or our own Markdown vault)
 * hands to the review screen and the import sweep.
 *
 * One exported page is one `ArchivePage`. Nothing here touches the database:
 * a page's kind is a *guess* the DM settles in review, its body is kept whole
 * as Tiptap JSON, and its links are placeholders until the sweep has created
 * the records they point at.
 */
import type { TiptapNode } from "@/lib/tiptap/markdownDocument";

export type { TiptapNode };

/** A Tiptap document as an object (stored as a JSON string in text columns: `JSON.stringify` it at the write). */
export interface TiptapDoc {
  type: "doc";
  content: TiptapNode[];
}

/** Which app wrote the archive, judged from structure. Informational: nothing requires it. */
export type ArchiveSource = "grimoire" | "obsidian" | "legendkeeper" | "worldanvil" | "unknown";

/**
 * What a page is guessed to be. `item` has no mention type (items cannot be
 * @mentioned) and `quest`/`note` neither; `skip` is "do not import" (player
 * characters, or a page the DM has dismissed).
 */
export type ArchivePageKind = "npc" | "location" | "faction" | "quest" | "item" | "note" | "skip";

/** A frontmatter value. Nested YAML is not read; only scalars and flat lists. */
export type FrontmatterValue = string | number | boolean | null | string[];

export interface ArchiveInputFile {
  /** File name; may carry a folder path (`webkitRelativePath`). A `.zip` is expanded. */
  name: string;
  bytes: Uint8Array;
}

export interface ArchivePage {
  /** Stable id: the page's path in the archive (after the shared root folder is dropped). */
  ref: string;
  /** Same as `ref`; kept separate so a future rename of the ref scheme cannot break path matching. */
  path: string;
  title: string;
  /** Folder names above the file, outermost first. */
  folders: string[];
  /** `ref` of the page this one nests under (folder note, `parent:` frontmatter), or null. */
  parentRef: string | null;
  kind: ArchivePageKind;
  /** Short human text for the review screen: "folder: NPCs", "frontmatter type: npc". */
  kindReason: string;
  tags: string[];
  /** Alternative names (`aliases` frontmatter): they count when resolving a link. */
  aliases: string[];
  frontmatter: Record<string, FrontmatterValue>;
  /** The page body, whole, as rich text. Links are `archiveLink` placeholder nodes. */
  body: TiptapDoc;
  /** Every distinct link target the body references (path-like, as written, `.html` stripped). */
  links: string[];
  /** Things the DM should know were not carried over: "2 embeds dropped". */
  notes: string[];
  format: "markdown" | "html";
}

export interface ArchiveSkip {
  path: string;
  reason: string;
}

export interface ArchiveReadResult {
  source: ArchiveSource;
  /** Why `source` was chosen, for the review screen: "README.md names a Grimoire export". */
  sourceEvidence: string[];
  pages: ArchivePage[];
  skipped: ArchiveSkip[];
}

/** The inline placeholder a link becomes in `ArchivePage.body`. Never written to the database. */
export type ArchiveLinkNode = {
  type: "archiveLink";
  attrs: { target: string; label: string };
};

/** What a resolver says a link target is, in the shape of an `entityMention`. */
export interface ArchiveMentionTarget {
  id: string;
  entityType: "player" | "npc" | "monster" | "location" | "party" | "faction";
}
