import type { DmNoteEntityType } from "@/lib/dmNotes/registry";

/** The entity a DM note is about, as the scratchpad and the inline boxes pass it around. */
export type DmNoteSubject = { type: DmNoteEntityType; id: string; label: string };

/** One entity the DM wrote a note on, kept so "what did I touch this session" is a read. */
export interface DmNoteTouch {
  id: string;
  user_id: string;
  campaign_id: string;
  entity_type: DmNoteEntityType;
  entity_id: string;
  entity_label: string;
  touched_at: string;
  created_at: string;
  updated_at: string;
}
