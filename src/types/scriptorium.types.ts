import type { AiProvenance } from "@/ai/provenance";

export type ScriptoriumDocType =
  | "custom"
  | "spell"
  | "monster"
  | "item"
  | "class"
  | "subclass"
  | "race"
  | "background"
  | "adventure"
  | "npc-sheet" // generated NPC character sheet / stat block
  | "location"
  | "quest";

export type ScriptoriumTheme = "onednd2024" | "phb2014";

export type ScriptoriumPageSize = "A4" | "A5" | "Letter";

/* ── Page furniture (Phase D, #456) ──────────────────────────────────────────
 * Decorations (watercolours, watermarks, artist credits, free art) live OUTSIDE
 * the Tiptap content stream, in a sibling `page_furniture` column, so they can
 * be anchored to a page or a block and dragged on the rendered book without
 * fighting auto-reflow. See SCRIPTORIUM_PLAN.md §2.2.
 */
export type FurnitureKind = "watercolor" | "watermark" | "artistCredit" | "art";

export type FurnitureAnchor =
  | { type: "page"; page: number } // 1-based physical page
  | { type: "block"; blockId: string }; // page that contains this block

export interface PageFurnitureItem {
  id: string;
  kind: FurnitureKind;
  anchor: FurnitureAnchor;
  /** Position as a percentage of the page box (so it survives page-size changes). */
  x: number; // left, % of page width
  y: number; // top, % of page height
  width: number; // % of page width
  /** Behind the text (under) or above it (over). */
  z: "under" | "over";
  /** Kind-specific data: variant, color, opacity, text, rotation, src, position… */
  props: Record<string, string | number>;
}

export interface ScriptoriumDocument {
  id: string;
  user_id: string;
  title: string;
  content: string | null; // Tiptap JSON string
  doc_type: ScriptoriumDocType;
  /** Campaign this document belongs to; null = account-wide (#915). Client
   *  never sets `demo_source` — that column exists only for the demo copy's
   *  quota exemption and is not part of this type. */
  campaign_id: string | null;
  /** Party member ids holding this document as a handout (#970). Empty unless
   *  the document belongs to a campaign; written only through `share_handout`,
   *  which also applies what the handout's linked entries reveal. */
  player_visible_to: string[];
  tags: string[];
  is_published: boolean;
  is_two_column: boolean;
  theme: ScriptoriumTheme;
  page_size: ScriptoriumPageSize;
  ink_friendly: boolean;
  word_count: number;
  show_page_numbers: boolean;
  footer_text: string;
  page_number_start: number;
  /** Page-furniture decorations (Phase D). JSONB column, defaults to [].
   * Optional until the column + editor wiring land (foundation-only for now). */
  page_furniture?: PageFurnitureItem[];
  /** Set when the Scriptorium AI drafted the body (epic #910); `markEdited` on a body save. */
  ai_provenance?: AiProvenance | null;
  created_at: string;
  updated_at: string;
}

/** What the document list renders. Deliberately excludes `content` — the full
 *  Tiptap JSON body — so browsing the list does not ship every document's text.
 *  The editor fetches the whole row separately by id. */
export type ScriptoriumDocumentSummary = Pick<
  ScriptoriumDocument,
  | "id"
  | "title"
  | "doc_type"
  | "campaign_id"
  | "tags"
  | "is_published"
  | "player_visible_to"
  | "word_count"
  | "created_at"
  | "updated_at"
>;

export type ScriptoriumDocInsert = Omit<
  ScriptoriumDocument,
  "id" | "user_id" | "created_at" | "updated_at" | "player_visible_to"
>;
export type ScriptoriumDocUpdate = Partial<ScriptoriumDocInsert>;

/** One linked entry the handout would reveal, as `share_handout` reports it. */
export type HandoutRevealed =
  | { type: "npc"; id: string; name: string; fields: string[]; seen_as: string | null }
  | { type: "location"; id: string; name: string; description: boolean }
  | { type: "quest"; id: string; name: string; starts: boolean }
  | { type: "monster"; id: string; name: string; stats: boolean };

export type HandoutWithheldReason = "not_revealed" | "found_only" | "outside_campaign";

/** A linked entry the handout leaves hidden, and why. */
export interface HandoutWithheld {
  type: string;
  id: string;
  name?: string;
  reason: HandoutWithheldReason;
}

/** The `share_handout` result; with `p_dry_run` it is the confirmation summary. */
export interface HandoutShareResult {
  /** Only what would change; entries already revealed to everyone are absent. */
  revealed: HandoutRevealed[];
  /** In document order. */
  withheld: HandoutWithheld[];
  /** Party member ids newly given the handout. */
  added: string[];
  removed: string[];
}
