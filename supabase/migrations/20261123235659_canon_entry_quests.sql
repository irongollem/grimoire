-- Any canon entry can be tied to the quests where it matters (#1255 items 12 and 13; the Canon review, 23 Nov 2026).
--
-- Only a force could be linked to a quest (`canon_force_quests`, "where the party meets it"). A secret the quest is
-- built to uncover, a truth it turns on, the lore it tells and the backstory it pays off had no way to say so, and a
-- quest's own page showed nothing of the canon behind it.
--
-- The table already is the right shape, so it is renamed and widened, not copied: `canon_entry_quests`, with
-- `entry_id` for `force_id`. A second table for the other parts would be one idea stored twice. The parts that may
-- be tied: a force, a secret, a truth, lore and a backstory. A premise entry and an open question are not (a
-- question that a quest answers is answered, and becomes a truth or a secret that can be).
--
-- Nothing about who may read changes: the policies read `campaign_id` only and are carried over by the rename, as
-- are the grants. Players still read none of it.

alter table public.canon_force_quests rename to canon_entry_quests;
alter table public.canon_entry_quests rename column force_id to entry_id;

alter table public.canon_entry_quests rename constraint canon_force_quests_pkey to canon_entry_quests_pkey;
alter table public.canon_entry_quests rename constraint canon_force_quests_once to canon_entry_quests_once;
alter table public.canon_entry_quests rename constraint canon_force_quests_campaign_id_fkey to canon_entry_quests_campaign_id_fkey;
alter table public.canon_entry_quests rename constraint canon_force_quests_force_id_fkey to canon_entry_quests_entry_id_fkey;
alter table public.canon_entry_quests rename constraint canon_force_quests_quest_id_fkey to canon_entry_quests_quest_id_fkey;
alter table public.canon_entry_quests rename constraint canon_force_quests_user_id_fkey to canon_entry_quests_user_id_fkey;
alter index public.canon_force_quests_campaign_idx rename to canon_entry_quests_campaign_idx;
alter index public.canon_force_quests_user_idx rename to canon_entry_quests_user_idx;
alter index public.canon_force_quests_quest_idx rename to canon_entry_quests_quest_idx;

alter policy "canon_force_quests_select" on public.canon_entry_quests rename to "canon_entry_quests_select";
alter policy "canon_force_quests_insert" on public.canon_entry_quests rename to "canon_entry_quests_insert";
alter policy "canon_force_quests_update" on public.canon_entry_quests rename to "canon_entry_quests_update";
alter policy "canon_force_quests_delete" on public.canon_entry_quests rename to "canon_entry_quests_delete";

alter trigger canon_force_quests_signal_insert on public.canon_entry_quests rename to canon_entry_quests_signal_insert;
alter trigger canon_force_quests_signal_update on public.canon_entry_quests rename to canon_entry_quests_signal_update;
alter trigger canon_force_quests_signal_delete on public.canon_entry_quests rename to canon_entry_quests_signal_delete;
alter trigger canon_force_quests_guard_content_author on public.canon_entry_quests rename to canon_entry_quests_guard_content_author;

-- The two triggers that name the column in their arguments are remade, not renamed.
drop trigger canon_force_quests_belong_to_a_force on public.canon_entry_quests;
create trigger canon_entry_quests_belong_to_an_entry
  before insert or update of entry_id on public.canon_entry_quests
  for each row execute procedure private.canon_child_belongs_to('force,secret,truth,lore,backstory', 'entry_id');

drop trigger zz_same_campaign_refs on public.canon_entry_quests;
create trigger zz_same_campaign_refs
  before insert or update of entry_id, quest_id, campaign_id
  on public.canon_entry_quests
  for each row execute procedure private.enforce_same_campaign_refs(
    'entry_id', 'canon_entries', 'owned',
    'quest_id', 'quests', 'owned');

update private.demo_campaign_tables set table_name = 'canon_entry_quests' where table_name = 'canon_force_quests';

-- A function's body is text, so a rename does not reach it. One names the table: the mover behind handing a
-- campaign's content from one account to another (ownership transfer, a DM leaving). It is restated whole, as it
-- stands today, with the new name in the one line that had the old, and one line added: the world's peoples
-- (`campaign_peoples`, #1255) go to the new owner with the rest of the canon. Their `user_id` cascades from the
-- account, so left behind they would be deleted with a departing owner's account.
CREATE OR REPLACE FUNCTION private.move_campaign_content(p_campaign_id uuid, p_from uuid, p_to uuid, p_scoped_homebrew boolean, p_player_rows boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_prev_move  text := current_setting('grimoire.content_move', true);
  v_prev_quota text := current_setting('grimoire.bypass_quota', true);
begin
  -- The author guard (private.guard_content_author) lets this through, and
  -- re-stamped rows are not new rows to count against anyone's quota.
  perform set_config('grimoire.content_move', 'on', true);
  perform set_config('grimoire.bypass_quota', 'on', true);

  update public.calendar_events       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.class_features        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.crafting_recipes      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.custom_classes        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.custom_subclasses     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.deities               set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.encounter_state       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.encounters            set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.factions              set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.items                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.kin_links             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.world_links           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.location_roads        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.story_facts           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_entries         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_clues           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_force_steps     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_force_ticks     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_entry_quests    set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_peoples      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_lore_passages   set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  -- Who wrote a passage moves with it (#1226 story 10): the journal tells a DM's passage from the player's
  -- by its author, so a passage the outgoing owner wrote must stay the DM's words.
  update public.canon_lore_passages   set author_id = p_to where campaign_id = p_campaign_id and author_id = p_from;
  update public.note_sorting          set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notice_board_pins     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notice_boards         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.locations             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.loot_tables           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notes                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_inventory         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_sets              set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npcs                  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.pantheons             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.puzzle_rooms          set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.quests                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.roll_tables           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.rules                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.scriptorium_documents set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.session_proposals     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_broadcast  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_pages      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_playlists  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_pads       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.sounds                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.species               set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.spells                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_sessions     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;

  -- What a member writes as a player (their own character, its inventory and
  -- companions, journal entries on items, class option texts). A seat that
  -- rotates has written these before it took the chair, so handing the chair
  -- back leaves them where they are; a transfer and a deleted account move
  -- them, the first because the outgoing owner wrote them as DM, the second
  -- because otherwise they cascade away.
  if p_player_rows then
    update public.class_option_texts set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.companions         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.party_inventory    set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.party_members      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.item_entries       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  end if;

  -- Rows that carry an author but no campaign_id, scoped by their parent.
  update public.faction_npcs f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.faction_party_members f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.store_items si set user_id = p_to
   where si.user_id = p_from
     and exists (select 1 from public.locations l where l.id = si.location_id and l.campaign_id = p_campaign_id);
  update public.location_doors d set user_id = p_to
   where d.user_id = p_from
     and exists (select 1 from public.locations l where l.id = d.from_location_id and l.campaign_id = p_campaign_id);
  update public.location_map_regions r set user_id = p_to
   where r.user_id = p_from
     and exists (select 1 from public.locations l where l.id = r.site_location_id and l.campaign_id = p_campaign_id);
  update public.location_placements lp set user_id = p_to
   where lp.user_id = p_from
     and exists (select 1 from public.locations l where l.id = lp.location_id and l.campaign_id = p_campaign_id);
  update public.location_state_events e set user_id = p_to
   where e.user_id = p_from
     and exists (select 1 from public.locations l where l.id = e.location_id and l.campaign_id = p_campaign_id);

  if p_scoped_homebrew then
    update public.monsters         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.traps            set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.dungeon_maps     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.dungeon_features set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  end if;

  perform set_config('grimoire.content_move', coalesce(v_prev_move, ''), true);
  perform set_config('grimoire.bypass_quota', coalesce(v_prev_quota, ''), true);
end;
$function$;

comment on table public.canon_entry_quests is
  'The quests a canon entry matters in: where the party meets a force, the secret a quest uncovers, the truth it turns on, the lore it tells, the backstory it pays off (#1255).';
