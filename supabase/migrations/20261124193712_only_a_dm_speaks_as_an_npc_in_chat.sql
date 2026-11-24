-- #1270: a chat line that speaks as an NPC (metadata.for_npc_id, drawn as the NPC's speech bubble with their face) may
-- only be stored by a DM of the campaign. The browser already draws such a line from anyone else as a plain bubble
-- (`readNpcSpeech` in src/lib/chat/npcSpeech.ts); this keeps a player from storing one at all.
--
-- The added clause is total: `metadata ? 'for_npc_id'` is NULL when metadata is NULL, and a NULL here would refuse
-- every ordinary line, so it is coalesced. Every campaign owner holds a `dm` row in campaign_members (checked on
-- 24 Nov 2026: none without), so private.is_campaign_dm covers the owner as the browser's check does. Lines the AI
-- table posts as a played character are written by the service role and are not affected.
drop policy if exists "campaign_messages_insert" on public.campaign_messages;
create policy "campaign_messages_insert" on public.campaign_messages
  for insert
  with check (
    (select auth.uid()) = user_id
    and private.is_campaign_member(campaign_id)
    and private.may_whisper(campaign_id, (select auth.uid()), recipient_user_id)
    and (not coalesce(metadata ? 'for_npc_id', false) or private.is_campaign_dm(campaign_id))
  );
