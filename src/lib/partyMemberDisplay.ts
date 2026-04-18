import type { PartyMember } from "@/types/party.types";

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
): boolean {
  // DM (null) and the player themselves always see the true form.
  return isInDisguise(member) && viewerMemberId !== null && viewerMemberId !== member.id;
}

/** The species ID whose full entry should be loaded and displayed to this viewer. */
export function getDisplaySpeciesId(
  member: Pick<PartyMember, "id" | "species_id"> & DisguiseFields,
  viewerMemberId: string | null,
): string | null {
  return shouldSeeDisguise(member, viewerMemberId)
    ? member.disguise_species_id
    : member.species_id;
}

/** The race label (name string) for the party card / lightbox header. */
export function getDisplayRace(
  member: Pick<PartyMember, "id"> & DisguiseFields,
  speciesName: string | null,
  viewerMemberId: string | null,
): string | null {
  return shouldSeeDisguise(member, viewerMemberId) ? member.disguise_race : speciesName;
}

export function getDisplaySubrace(
  member: Pick<PartyMember, "id" | "subrace"> & DisguiseFields,
  viewerMemberId: string | null,
): string | null {
  return shouldSeeDisguise(member, viewerMemberId)
    ? (member.disguise_subrace ?? null)
    : (member.subrace ?? null);
}
