import type { PartyMember } from "@/types/party.types";
import { formatMulticlassLabel, totalLevel } from "@/types/multiclass.types";
import type { CharacterClass } from "@/types/multiclass.types";

type DisguiseFields = Pick<
  PartyMember,
  "disguise_species_id" | "disguise_race" | "disguise_subrace"
>;

/** True when a disguise species is currently active. */
export function isInDisguise(member: DisguiseFields): boolean {
  return !!member.disguise_species_id;
}

function shouldSeeDisguise(
  member: Pick<PartyMember, "id"> & DisguiseFields,
  viewerMemberId: string | null,
  viewerIsDm = false,
): boolean {
  if (!isInDisguise(member)) return false;
  // DM (not in preview mode) and the shapeshifter themselves see the true form.
  if (viewerIsDm) return false;
  if (viewerMemberId === member.id) return false;
  return true;
}

/** The species ID whose full entry should be loaded and displayed to this viewer. */
export function getDisplaySpeciesId(
  member: Pick<PartyMember, "id" | "species_id"> & DisguiseFields,
  viewerMemberId: string | null,
  viewerIsDm = false,
): string | null {
  return shouldSeeDisguise(member, viewerMemberId, viewerIsDm)
    ? member.disguise_species_id
    : member.species_id;
}

/** The race label (name string) for the party card / lightbox header. */
export function getDisplayRace(
  member: Pick<PartyMember, "id"> & DisguiseFields,
  speciesName: string | null,
  viewerMemberId: string | null,
  viewerIsDm = false,
): string | null {
  return shouldSeeDisguise(member, viewerMemberId, viewerIsDm) ? member.disguise_race : speciesName;
}

export function getDisplaySubrace(
  member: Pick<PartyMember, "id" | "subrace"> & DisguiseFields,
  viewerMemberId: string | null,
  viewerIsDm = false,
): string | null {
  return shouldSeeDisguise(member, viewerMemberId, viewerIsDm)
    ? (member.disguise_subrace ?? null)
    : (member.subrace ?? null);
}

/**
 * Class part of the summary line: "Fighter 5 / Wizard 3" when multiclass,
 * "Class · Subclass" for a single class, empty for a classless character.
 */
function classLabelFor(classes: readonly CharacterClass[]): string {
  if (classes.length > 1) return formatMulticlassLabel([...classes]);
  if (classes.length === 1) {
    const only = classes[0];
    return [only.class_name, only.subclass_name].filter(Boolean).join(" · ");
  }
  return "";
}

/**
 * One-line character summary and total level for sheet headers and the Hearth
 * card: `line` is "Wood Elf · Ranger · Hunter" (missing parts drop out) and
 * `level` is the sum of class levels, or `fallbackLevel` for a classless
 * character (its own `party_members.level`).
 */
export function characterSummary(input: {
  speciesName: string | null;
  subrace: string | null;
  classes: readonly CharacterClass[] | null | undefined;
  fallbackLevel: number;
}): { level: number; line: string } {
  const classes = input.classes ?? [];
  return {
    level: classes.length > 0 ? totalLevel([...classes]) : input.fallbackLevel,
    line: [input.speciesName, input.subrace, classLabelFor(classes)].filter(Boolean).join(" · "),
  };
}
