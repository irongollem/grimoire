import type { CoverRule, MoraleRule, TacticalProfile, TacticalRole, TargetRule } from "@/rules/fight/tactics/profile";

/** The words for a creature's tactics (#1203), shared by the fields that set them and the sheet that shows them. */
export const ROLE_LABELS: Record<TacticalRole, string> = {
  brute: "Brute",
  skirmisher: "Skirmisher",
  artillery: "Artillery",
  controller: "Controller",
  leader: "Leader",
  lurker: "Lurker",
};
export const TARGET_LABELS: Record<TargetRule, string> = {
  nearest: "Whoever is nearest",
  most_wounded: "The most wounded",
  spellcasters_first: "Spellcasters first",
  lowest_armor: "The lowest armor",
};
export const COVER_LABELS: Record<CoverRule, string> = {
  ignores: "Ignores it",
  when_cheap: "Takes it when it is cheap",
  fights_from: "Fights from it",
};

export function moraleLabel(m: MoraleRule): string {
  if (m.breaksAt <= 0) return "Fights to the death";
  const share = `${Math.round(m.breaksAt * 100)}% of its hit points`;
  const at = m.breaksAt === 0.25 ? "a quarter of its hit points" : m.breaksAt === 0.5 ? "half its hit points" : share;
  // A creature told to fight on keeps fighting however hurt it is (pick.ts, RULE gate), so this is worded as what it does.
  if (m.then === "fight_on") return `Fights on below ${at}`;
  return `${m.then === "flee" ? "Flees" : "Surrenders"} at ${at}`;
}

const ROLE_PHRASES: Record<TacticalRole, string> = {
  brute: "a brute",
  skirmisher: "a skirmisher",
  artillery: "artillery",
  controller: "a controller",
  leader: "a leader",
  lurker: "a lurker",
};
const COVER_PHRASES: Record<CoverRule, string> = {
  ignores: "Ignores cover",
  when_cheap: "Takes cover when it is cheap",
  fights_from: "Fights from cover",
};

/** A profile read out for a sheet, one short sentence per field, in the order the fields are set in. */
export function tacticsSentences(profile: TacticalProfile): string[] {
  const goesFor = TARGET_LABELS[profile.targets];
  return [
    `Fights as ${ROLE_PHRASES[profile.role]}.`,
    `Goes for ${goesFor.charAt(0).toLowerCase()}${goesFor.slice(1)}.`,
    `${COVER_PHRASES[profile.cover]}.`,
    `${moraleLabel(profile.morale)}.`,
  ];
}
