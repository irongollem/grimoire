export type MonsterType =
  | 'aberration' | 'beast' | 'celestial' | 'construct' | 'dragon'
  | 'elemental' | 'fey' | 'fiend' | 'giant' | 'humanoid'
  | 'monstrosity' | 'ooze' | 'plant' | 'undead'

export type MonsterSize = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan'

export interface MonsterStatBlock {
  armor_class: number
  hit_points: string              // e.g. "52 (8d8+16)"
  speed: string                   // e.g. "30 ft."
  str: number
  dex: number
  con: number
  int: number
  wis: number
  cha: number
  challenge_rating: string        // e.g. "5" | "1/2" | "1/4"
  saving_throws?: string          // e.g. "Con +5, Wis +3"
  skills?: Record<string, string> // e.g. { perception: '+3', stealth: '+5' }
  damage_vulnerabilities?: string
  damage_resistances?: string
  damage_immunities?: string
  condition_immunities?: string
  senses?: string
  languages?: string
  special_abilities?: Array<{ name: string; description: string }>
  actions?: Array<{ name: string; description: string }>
  bonus_actions?: Array<{ name: string; description: string }>
  reactions?: Array<{ name: string; description: string }>
  legendary_resistance?: number
  legendary_actions?: Array<{ name: string; description: string }>
  lair_actions?: Array<{ name: string; description: string }>
}

export interface Monster {
  id: string
  user_id: string
  name: string
  monster_type: MonsterType
  size: MonsterSize
  alignment: string
  habitat: string | null
  source: string | null
  tags: string[]
  stat_block: MonsterStatBlock
  notes: string | null
  created_at: string
  updated_at: string
}

export type MonsterInsert = Omit<Monster, 'id' | 'user_id' | 'created_at' | 'updated_at'>
export type MonsterUpdate = Partial<MonsterInsert>
