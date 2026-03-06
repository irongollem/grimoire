export type SkillProfLevel = 'none' | 'proficient' | 'expertise'
export type SaveKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'

export interface SkillProficiencies {
  acrobatics?: SkillProfLevel
  animal_handling?: SkillProfLevel
  arcana?: SkillProfLevel
  athletics?: SkillProfLevel
  deception?: SkillProfLevel
  history?: SkillProfLevel
  insight?: SkillProfLevel
  intimidation?: SkillProfLevel
  investigation?: SkillProfLevel
  medicine?: SkillProfLevel
  nature?: SkillProfLevel
  perception?: SkillProfLevel
  performance?: SkillProfLevel
  persuasion?: SkillProfLevel
  religion?: SkillProfLevel
  sleight_of_hand?: SkillProfLevel
  stealth?: SkillProfLevel
  survival?: SkillProfLevel
}

export const SKILLS: Array<{ key: keyof SkillProficiencies; label: string; ability: SaveKey }> = [
  { key: 'acrobatics', label: 'Acrobatics', ability: 'dex' },
  { key: 'animal_handling', label: 'Animal Handling', ability: 'wis' },
  { key: 'arcana', label: 'Arcana', ability: 'int' },
  { key: 'athletics', label: 'Athletics', ability: 'str' },
  { key: 'deception', label: 'Deception', ability: 'cha' },
  { key: 'history', label: 'History', ability: 'int' },
  { key: 'insight', label: 'Insight', ability: 'wis' },
  { key: 'intimidation', label: 'Intimidation', ability: 'cha' },
  { key: 'investigation', label: 'Investigation', ability: 'int' },
  { key: 'medicine', label: 'Medicine', ability: 'wis' },
  { key: 'nature', label: 'Nature', ability: 'int' },
  { key: 'perception', label: 'Perception', ability: 'wis' },
  { key: 'performance', label: 'Performance', ability: 'cha' },
  { key: 'persuasion', label: 'Persuasion', ability: 'cha' },
  { key: 'religion', label: 'Religion', ability: 'int' },
  { key: 'sleight_of_hand', label: 'Sleight of Hand', ability: 'dex' },
  { key: 'stealth', label: 'Stealth', ability: 'dex' },
  { key: 'survival', label: 'Survival', ability: 'wis' },
]

export interface PartyMember {
  id: string
  user_id: string
  name: string
  player_name: string | null
  class: string | null
  subclass: string | null
  level: number
  race: string | null
  max_hp: number
  current_hp: number
  temp_hp: number
  ac: number
  speed: number
  initiative_bonus: number
  current_initiative: number | null
  str: number
  dex: number
  con: number
  int: number
  wis: number
  cha: number
  proficiency_bonus: number
  skill_proficiencies: SkillProficiencies
  saving_throw_proficiencies: SaveKey[]
  conditions: string[]
  inspiration: boolean
  death_save_successes: number
  death_save_failures: number
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export type PartyMemberInsert = Omit<PartyMember, 'id' | 'user_id' | 'created_at' | 'updated_at'>
export type PartyMemberUpdate = Partial<PartyMemberInsert>

export const CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Exhausted 1', 'Exhausted 2',
  'Exhausted 3', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible',
  'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious',
]
