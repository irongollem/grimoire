// Edge-function mirror of the client game-system registry (#934). A campaign
// plays one system: 'dnd5e-2014', 'dnd5e-2024' or 'generic'. A 5e edition is a
// property of a 5e system; Generic has none, and nothing here ever falls back
// to 2014 for it.

export const GAME_SYSTEM_KEYS = ["dnd5e-2014", "dnd5e-2024", "generic"] as const;
export type GameSystemKey = (typeof GAME_SYSTEM_KEYS)[number];

export function isGameSystemKey(value: unknown): value is GameSystemKey {
  return typeof value === "string" && (GAME_SYSTEM_KEYS as readonly string[]).includes(value);
}

/** The 5e content edition of a system, or undefined when it has none (Generic, unknown). */
export function gameSystemEdition(system: unknown): "2014" | "2024" | undefined {
  if (system === "dnd5e-2014") return "2014";
  if (system === "dnd5e-2024") return "2024";
  return undefined;
}

/** The `ai_system_prompts.generator_type` holding the system's rules context, or undefined for a system with none. */
export function rulesetContextKey(system: unknown): string | undefined {
  const edition = gameSystemEdition(system);
  return edition ? `ruleset_context_${edition}` : undefined;
}

/** The message a 5e-shaped generator answers a campaign that plays no rules system. */
export const NO_RULES_SYSTEM_MESSAGE = "This campaign plays no rules system.";
