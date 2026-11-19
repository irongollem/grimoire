-- #1201, stage 1: a fight remembers the commands it has applied.
--
-- The runner is about to send commands to a server function and keep working while it waits (decision 8 on the
-- issue): it acts locally at once, queues what it sent, and sends again when a reply never came. A reply can be
-- lost after the server applied the command, so the same "4 damage to the ogre" may arrive twice. Every batch
-- carries an id the client made; the server writes the id with the state in the same update, and a batch whose id
-- is already here is answered with the current state and not applied again.
--
-- Only the most recent ids are kept (the function trims the list): a retry comes within moments, not days.

alter table public.encounter_state
  add column applied_command_ids text[] not null default '{}';

comment on column public.encounter_state.applied_command_ids is
  'Ids of the most recent command batches applied by encounter-command, newest last, so a retried batch is not applied twice.';
