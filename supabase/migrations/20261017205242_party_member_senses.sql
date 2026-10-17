-- Migration: party_member_senses
-- The senses a character has from anything but its species (#1073, story 9).
--
-- The battle map shows a player what their own token sees in the dark. Darkvision from the character's species is a
-- rule and is read from the species itself (`darkvisionFeet`), so it is never copied here. Everything else a character
-- can sense with (a class feature such as a Gloom Stalker's Umbral Sight, the Blind Fighting style's blindsight, a feat,
-- Goggles of Night, the *darkvision* spell) has no rule the app could read, so the player or the DM writes it, in the
-- same form a stat block uses: "darkvision 60 ft., blindsight 10 ft.". The token takes the better of the species and
-- this field for each sense; two sources of darkvision do not add up.
--
-- Free text with a length bound, like the stat block's own `senses`. Writable through the existing `party_members_update`
-- policy (owner, creator, claimant or DM); the caretaker guard blocks it for someone playing another's character, as it
-- blocks every build field.

alter table public.party_members add column senses text
  constraint party_members_senses_length check (senses is null or char_length(senses) <= 200);

comment on column public.party_members.senses is
  'Senses the character has from anything but its species (#1073), as a stat block writes them: "darkvision 60 ft., blindsight 10 ft.". Species darkvision is read from the species, not stored here.';
