export const TRAP_TYPES = ["Mechanical", "Magical", "Hybrid", "Environmental"] as const;
export type TrapType = typeof TRAP_TYPES[number];

export const TRAP_TYPE_COLORS: Record<TrapType, string> = {
  Mechanical:    "#b45309",
  Magical:       "#7c3aed",
  Hybrid:        "#0284c7",
  Environmental: "#16a34a",
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

export const CR_LIST = [
  "0", "1/8", "1/4", "1/2",
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "21", "22", "23", "24", "25", "26", "27", "28", "29", "30",
] as const;

export interface Trap {
  id: string;
  user_id: string;
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
  damage_dice: string | null;
  damage_type: string | null;
  reset_type: TrapResetType;
  image_url: string | null;
  image_focal_point: { x: number; y: number } | null;
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type TrapInsert = Omit<Trap, "id" | "user_id" | "created_at" | "updated_at">;
export type TrapUpdate = Partial<TrapInsert>;
