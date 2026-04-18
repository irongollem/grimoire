export type NoteCategory =
  | "general"
  | "session"
  | "lore"
  | "location"
  | "quest"
  | "faction";

export interface Note {
  id: string;
  user_id: string;
  campaign_id: string | null;
  title: string;
  content: string | null; // Tiptap JSON string
  category: NoteCategory;
  tags: string[];
  session_num: number | null;
  is_pinned: boolean;
  player_visible_to: string[];
  // Session date fields — only meaningful when category === 'session'
  session_start_year: number | null;
  session_start_month: number | null;
  session_start_day: number | null;
  session_end_year: number | null;
  session_end_month: number | null;
  session_end_day: number | null;
  session_real_date: string | null; // real-world date "YYYY-MM-DD"
  linked_calendar_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export type NoteInsert = Omit<
  Note,
  "id" | "user_id" | "created_at" | "updated_at"
>;
export type NoteUpdate = Partial<NoteInsert>;
