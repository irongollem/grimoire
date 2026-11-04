import { SKILLS } from "@/types/party.types";

const LABELS = new Map<string, string>(SKILLS.map((s) => [s.key, s.label]));

/**
 * A stat block's skills as a card prints them: "Stealth +6, Sleight of Hand +6".
 * Stat blocks key skills the way the rules data does (`sleight_of_hand`), so a
 * card that only capitalised the key printed "Sleight_of_hand". The book name
 * comes from the one skill list; a key it does not know (a homebrew skill) is
 * spelled out from the key itself.
 */
export function skillsLine(skills: Record<string, string>): string {
  return Object.entries(skills)
    .map(([key, bonus]) => `${LABELS.get(key) ?? spelledOut(key)} ${bonus}`)
    .join(", ");
}

function spelledOut(key: string): string {
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
