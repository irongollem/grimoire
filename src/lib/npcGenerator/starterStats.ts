import { getNpcTemplate } from "@/data/npcTemplates";

const RULES: { cues: readonly string[]; template: string }[] = [
  { cues: ["bandit captain", "outlaw captain", "gang leader"], template: "bandit_captain" },
  { cues: ["cult fanatic", "cult leader", "fanatic"], template: "cult_fanatic" },
  { cues: ["assassin", "killer for hire"], template: "assassin" },
  { cues: ["bandit", "outlaw", "robber", "highwayman"], template: "bandit" },
  { cues: ["thug", "brawler", "enforcer"], template: "thug" },
  { cues: ["spy", "informant", "infiltrator"], template: "spy" },
  { cues: ["gladiator", "arena fighter"], template: "gladiator" },
  { cues: ["berserker", "barbarian"], template: "berserker" },
  { cues: ["knight", "paladin"], template: "knight" },
  { cues: ["veteran", "mercenary", "soldier", "warrior", "military officer"], template: "veteran" },
  { cues: ["guard", "watchman", "watch officer", "city watch", "constable"], template: "guard" },
  { cues: ["scout", "ranger", "hunter", "tracker"], template: "scout" },
  { cues: ["cultist", "cult member"], template: "cultist" },
  { cues: ["novice priest", "acolyte"], template: "acolyte" },
  { cues: ["priest", "cleric", "temple keeper"], template: "priest" },
  { cues: ["mage", "wizard", "sorcerer", "warlock", "spellcaster"], template: "mage" },
  { cues: ["noble", "aristocrat", "duke", "duchess", "lord", "lady"], template: "noble" },
];

/** Pick a suitable reserved stat profile from the generated NPC's occupation and tags. */
export function npcStarterStatTemplate(occupation: string | null | undefined, tags: readonly string[] = []): string {
  const description = ` ${[occupation ?? "", ...tags].join(" ").toLowerCase()} `;
  const match = RULES.find((rule) => rule.cues.some((cue) => {
    const escaped = cue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(description);
  }));
  return getNpcTemplate(match?.template ?? "commoner")?.id ?? "commoner";
}
