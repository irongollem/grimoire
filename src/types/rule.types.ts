// ── SRD rules (shared, read-only from client) ─────────────────────────────────

export interface SrdRule {
  id: string;
  slug: string;
  name: string;
  content: string;       // plain text from Open5e
  parent_slug: string | null;
  doc_slug: string;
  created_at: string;
  updated_at: string;
}

// ── Custom rules (per-user) ───────────────────────────────────────────────────

export const RULE_CATEGORIES = [
  "Combat",
  "Exploration",
  "Social",
  "Crafting",
  "Magic",
  "Environment",
  "Economy",
  "Other",
] as const;

export type RuleCategory = (typeof RULE_CATEGORIES)[number];

export interface Rule {
  id: string;
  user_id: string;
  title: string;
  content: object | null;   // Tiptap JSON
  category: string | null;
  tags: string[];
  is_player_visible: boolean;
  created_at: string;
  updated_at: string;
}

export type RuleInsert = Omit<Rule, "id" | "user_id" | "created_at" | "updated_at">;
export type RuleUpdate = Partial<RuleInsert>;
