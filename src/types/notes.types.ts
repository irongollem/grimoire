export type NoteCategory = 'general' | 'session' | 'lore' | 'location' | 'quest' | 'faction'

export interface Note {
  id: string
  user_id: string
  title: string
  content: string | null  // Tiptap JSON string
  category: NoteCategory
  tags: string[]
  session_num: number | null
  is_pinned: boolean
  created_at: string
  updated_at: string
}

export type NoteInsert = Omit<Note, 'id' | 'user_id' | 'created_at' | 'updated_at'>
export type NoteUpdate = Partial<NoteInsert>
