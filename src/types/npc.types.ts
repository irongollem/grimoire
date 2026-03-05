export type NpcStatus = 'alive' | 'dead' | 'missing' | 'unknown'
export type NpcRelationship = 'ally' | 'neutral' | 'enemy' | 'unknown'

export interface StatBlock {
  armor_class: number
  hit_points: string         // e.g. "52 (8d8 + 16)"
  speed: string              // e.g. "30 ft."
  str: number
  dex: number
  con: number
  int: number
  wis: number
  cha: number
  challenge_rating: string   // e.g. "5" or "1/2"
  skills?: Record<string, string>
  damage_resistances?: string
  damage_immunities?: string
  condition_immunities?: string
  senses?: string
  languages?: string
  special_abilities?: Array<{ name: string; description: string }>
  actions?: Array<{ name: string; description: string }>
  legendary_actions?: Array<{ name: string; description: string }>
}

export interface Npc {
  id: string
  user_id: string
  name: string
  race: string | null
  class: string | null
  alignment: string | null
  age: string | null
  occupation: string | null
  location: string | null
  affiliation: string | null
  appearance: string | null
  personality: string | null
  backstory: string | null
  secret: string | null       // DM-only secret
  notes: string | null
  status: NpcStatus
  relationship: NpcRelationship
  portrait_url: string | null
  tags: string[]
  stat_block: StatBlock | null
  scriptorium_doc_id: string | null  // links to a ScriptoriumDocument (e.g. stat block sheet)
  created_at: string
  updated_at: string
}

export type NpcInsert = Omit<Npc, 'id' | 'user_id' | 'created_at' | 'updated_at'>
export type NpcUpdate = Partial<NpcInsert>
