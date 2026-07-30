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
  | "tags"
  | "is_published"
  | "word_count"
  | "created_at"
  | "updated_at"
>;

export type ScriptoriumDocInsert = Omit<
  ScriptoriumDocument,
  "id" | "user_id" | "created_at" | "updated_at"
>;
export type ScriptoriumDocUpdate = Partial<ScriptoriumDocInsert>;
