-- The Narrator's voice is the table's choice (#1021 row 21).
--
-- The host chooses whether the Narrator sounds like a man or a woman. It is kept on the table's own row and not
-- per player (the maintainer, 18 Nov 2026: "why per player? then we end up with double the generation cost"): a
-- line's clip is made once and kept, so a second voice for the same line would be a second clip paid for.
--
-- Two words and not a voice id: which voice each word means is the speech function's to say
-- (`table-voice/voicePick.ts`), so a voice can be replaced without touching a row.
alter table public.agent_sessions
  add column narrator_voice text not null default 'male' check (narrator_voice in ('male', 'female'));

-- The host changes it at the table. The row had no update for a client at all (the server writes everything else),
-- so the grant names this one column: the policy lets the owner update their row, and the grant keeps every other
-- column (the credits spent, the fight in progress) out of reach.
create policy "agent_sessions_update" on public.agent_sessions
  for update
  using ((select auth.uid()) = user_id and (private.is_campaign_member(campaign_id) or private.is_campaign_dm(campaign_id)))
  with check ((select auth.uid()) = user_id and (private.is_campaign_member(campaign_id) or private.is_campaign_dm(campaign_id)));

grant update (narrator_voice) on public.agent_sessions to authenticated;
