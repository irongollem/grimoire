/**
 * The request the Quest Generator sends `generate-quest` (and Ask Grimoire's quest hooks send the same one): the
 * party's level, the quest giver and place the DM fixed, and a theme. One builder, so the panel and Ask cannot
 * describe the same constraints two ways.
 */

export interface HooksPromptGiver {
  name: string;
  occupation: string | null;
  relationship: string | null;
}

export interface HooksPromptInput {
  partyLevels: readonly number[];
  giver: HooksPromptGiver | null;
  location: { name: string } | null;
  theme: string;
}

/** The party's average level, rounded up; 1 when nobody is in it. */
export function averagePartyLevel(levels: readonly number[]): number {
  if (levels.length === 0) return 1;
  return Math.ceil(levels.reduce((a, b) => a + b, 0) / levels.length);
}

export function buildQuestHooksPrompt({ partyLevels, giver, location, theme }: HooksPromptInput): { prompt: string; concept: string } {
  const level = averagePartyLevel(partyLevels);
  const lines: string[] = [`Party level: ${level}`];

  const constraints: string[] = [];
  if (giver) {
    const detail = [giver.occupation, giver.relationship].filter(Boolean).join(", ");
    constraints.push(`Quest Giver: ${giver.name}${detail ? ` (${detail})` : ""}`);
  }
  if (location) constraints.push(`Location: ${location.name}`);

  if (constraints.length) {
    lines.push(
      "\nUse these constraints for all 5 hooks (the quest giver and location are already set — weave them naturally into the hook descriptions and discovery objectives):",
    );
    lines.push(constraints.join("\n"));
  }

  const themed = theme.trim();
  if (themed) lines.push(`\nTheme: ${themed}`);

  return { prompt: lines.join("\n"), concept: themed || `Level ${level} quest hooks` };
}
