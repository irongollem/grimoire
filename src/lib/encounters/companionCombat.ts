import type { Companion } from "@/types/companion.types";

/**
 * Whether a companion can ever be fielded in an encounter. A pet has a stat
 * block so the DM can answer what happens to it, but it ignores combat and
 * nobody commands it (maintainer, 29 Oct 2026; #1115). The database enforces
 * the same rule (`companions_pet_never_fights`); this is the client's one
 * predicate for hiding, skipping and not counting pets.
 */
export function takesPartInCombat(companion: Pick<Companion, "companion_type">): boolean {
  return companion.companion_type !== "pet";
}
