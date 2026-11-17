// Whose story the AI table tells (#1021). A conversation keeps the party member the player plays, and this file is
// what the narrator and the people in the room learn of them: a short section of the system text, and the rule for
// when a character's answer is "to the player" because it used their name. Pure: no I/O.

/** What is known of the player's character, as the server read it. Only what the section below may say. */
export interface PlayerCharacter {
  id: string;
  name: string;
  pronouns: string | null;
  /** The species or subrace as a person would say it; null when the sheet has none. */
  species: string | null;
  className: string | null;
  subclass: string | null;
  level: number | null;
  hitPoints: { current: number; max: number } | null;
}

/** Every free-text field is somebody's typing, and this section is paid for on every turn, so each has a ceiling. */
const FIELD_MAX = 60;

const clip = (s: string): string => (s.length > FIELD_MAX ? `${s.slice(0, FIELD_MAX - 1).trimEnd()}…` : s);

/** The block of the system text that says who the player plays. Sits after the campaign and before the scene. */
export function playerCharacterSection(c: PlayerCharacter): string {
  const lines = ["## The player's character", "", `${clip(c.name)}${c.pronouns ? ` (${clip(c.pronouns)})` : ""}`];
  const kind = [
    c.level === null ? null : `level ${c.level}`,
    c.species ? clip(c.species) : null,
    c.className ? clip(c.className) : null,
  ].filter((p): p is string => p !== null).join(" ");
  const facts = [
    kind ? `${kind}${c.subclass ? ` (${clip(c.subclass)})` : ""}` : null,
    c.hitPoints ? `hit points ${c.hitPoints.current} of ${c.hitPoints.max}` : null,
  ].filter((p): p is string => p !== null);
  if (facts.length > 0) lines.push(facts.join("; "));
  lines.push(
    "",
    "This is who the player plays. Speak to them by this name and describe what this character perceives. Never " +
      "decide what they say or do. Use this name, never \"the player\", in what you hand to the characters.",
  );
  return lines.join("\n");
}

const words = (s: string): string[] => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * Whether a character's answer, addressed TO this, is addressed to the player: the whole name or its first word,
 * either case ("Wren" for "Wren Ashfield"). Anything longer or different is not taken for the player, so a name
 * that only contains theirs among others' does not end the exchange.
 */
export function isPlayerName(raw: string, name: string): boolean {
  const want = words(raw);
  const have = words(name);
  if (want.length === 0 || have.length === 0) return false;
  return want.join(" ") === have.join(" ") || (want.length === 1 && want[0] === have[0]);
}
