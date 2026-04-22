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
  created_at: string;
  updated_at: string;
}

export type ScriptoriumDocInsert = Omit<
  ScriptoriumDocument,
  "id" | "user_id" | "created_at" | "updated_at"
>;
export type ScriptoriumDocUpdate = Partial<ScriptoriumDocInsert>;
