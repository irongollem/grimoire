export type ScriptoriumDocType =
  | 'custom'
  | 'spell'
  | 'monster'
  | 'item'
  | 'class'
  | 'subclass'
  | 'race'
  | 'background'
  | 'adventure'
  | 'npc-sheet'    // generated NPC character sheet / stat block

export interface ScriptoriumDocument {
  id: string
  user_id: string
  title: string
  content: string | null  // Tiptap JSON string
  doc_type: ScriptoriumDocType
  tags: string[]
  is_published: boolean
  word_count: number
  created_at: string
  updated_at: string
}

export type ScriptoriumDocInsert = Omit<ScriptoriumDocument, 'id' | 'user_id' | 'created_at' | 'updated_at'>
export type ScriptoriumDocUpdate = Partial<ScriptoriumDocInsert>
