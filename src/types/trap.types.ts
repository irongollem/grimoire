import type { AiProvenance } from "@/ai/provenance";

export const TRAP_TYPES = ["Mechanical", "Magical", "Hybrid", "Environmental"] as const;
export type TrapType = typeof TRAP_TYPES[number];

export const TRAP_TYPE_BG: Record<TrapType, string> = {
  Mechanical:       "bg-trap-mechanical",
  Magical:          "bg-trap-magical",
  Hybrid:           "bg-trap-hybrid",
  Environmental:    "bg-trap-environmental",
};

/** The same ramp as `var()` values, for CSS custom properties and other
 *  places a utility class cannot reach (#744). */
export const TRAP_TYPE_VAR: Record<TrapType, string> = {
  Mechanical:    "var(--trap-mechanical)",
  Magical:       "var(--trap-magical)",
  Hybrid:        "var(--trap-hybrid)",
  Environmental: "var(--trap-environmental)",
};

export const TRAP_TRIGGERS = [
  "Tripwire",
  "Pressure Plate",
  "Proximity",
  "Visual",
  "Sound",
  "Magic Sensor",
  "Manual",
  "Other",
] as const;
export type TrapTrigger = typeof TRAP_TRIGGERS[number];

export const TRAP_RESET_TYPES = ["None", "Automatic", "Manual"] as const;
export type TrapResetType = typeof TRAP_RESET_TYPES[number];

export const TRAP_SAVE_TYPES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
export type TrapSaveType = typeof TRAP_SAVE_TYPES[number];

export interface DamageEntry {
  dice: string;
  type: string;
}

export const CR_LIST = [
  "0", "1/8", "1/4", "1/2",
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "21", "22", "23", "24", "25", "26", "27", "28", "29", "30",
] as const;

export interface Trap {
  id: string;
  user_id: string;
  /** NULL = available in every campaign; set = only visible when that campaign
   *  is active. */
  campaign_id: string | null;
  name: string;
  description: string | null;
  trap_type: TrapType;
  cr: string | null;
  trigger_type: TrapTrigger | null;
  detection_dc: number | null;
  disarm_dc: number | null;
  effect_description: string | null;
  save_type: TrapSaveType | null;
  save_dc: number | null;
  attack_bonus: number | null;
  damage_entries: DamageEntry[];
  reset_type: TrapResetType;
  trap_hp: number | null;
  trap_ac: number | null;
  damage_immunities: string[];
  image_url: string | null;
  image_focal_point: { x: number; y: number } | null;
  tags: string[];
  notes: string | null;
  ai_provenance?: AiProvenance | null;
  created_at: string;
  updated_at: string;
}

export type TrapInsert = Omit<Trap, "id" | "user_id" | "created_at" | "updated_at">;
export type TrapUpdate = Partial<TrapInsert>;
