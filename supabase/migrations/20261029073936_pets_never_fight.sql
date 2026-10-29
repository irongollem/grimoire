-- Migration: pets_never_fight
-- A pet never takes part in combat (#1115), held by the table rather than by
-- every screen that seats a combatant.
--
-- `combat_ready` is what every combat path already reads: the runner benches a
-- companion that is not ready (buildRunCombatants), the lobby re-add skips it,
-- and the player's "Joining / Elsewhere" toggle writes it. A pet is therefore
-- simply a companion that can never be ready. The check makes that a property
-- of the row, so a client that forgets the rule (an old tab, a toggle left
-- visible, a backup restore) is refused instead of seating a tea mouse in
-- initiative. The client hides the toggle for a pet; this is the boundary.

alter table public.companions
  add constraint companions_pet_never_fights
  check (companion_type <> 'pet' or combat_ready = false);
