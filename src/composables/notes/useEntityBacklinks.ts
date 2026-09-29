import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { contentMentionsEntity } from "@/lib/tiptap/mentions";
import { placeRoute } from "@/lib/locations/placeRoute";

export type BacklinkKind = "note" | "npc" | "location" | "faction" | "quest-beat" | "party-member";

export interface EntityBacklink {
  kind: BacklinkKind;
  id: string;
  title: string;
  to: string;
}

const KEY_ROOT = "backlinks";

/**
 * Everywhere a given entity can be `@mentioned` — the "Mentioned in" section
 * on a DM detail surface (epic #932, stories 1 and 3). Originally notes
 * only; now also npcs.appearance/personality/backstory/notes,
 * locations.description, factions.description,
 * quest_beats.dm_content/read_aloud/how_it_plays, and
 * party_members' persona columns + notes.
 *
 * Each source is queried the same way: `.like`/`.or(...)` narrows to rows
 * whose stored Tiptap JSON merely *contains* the id as a substring (cheap,
 * but a false positive if the id sits inside another mention's id, or plain
 * text), and every hit is then confirmed by parsing its content and walking
 * for a real `entityMention` node via `contentMentionsEntity`. A row whose
 * id equals the target excludes itself — an entity's own text can legally
 * contain its own id as a substring of nothing meaningful, but a genuine
 * self-mention is not something "Mentioned in" should surface as if it
 * were a reference from elsewhere. This is enforced twice: a `.neq("id",
 * id)` at the query (cheap, prunes the row before it's ever fetched) and a
 * matching `row.id !== id` in the in-memory filter (so the exclusion holds
 * regardless of what the query layer actually did — the same
 * belt-and-braces the `.like`/`contentMentionsEntity` pair already uses).
 * Quest beats and notes are exempt from that exclusion: neither is itself a
 * mentionable entity type (see `EntityMentionItem`), so their id can never
 * collide with the id being searched for.
 *
 * ## Invalidation
 *
 * The six source tables live under six query roots (`notes`, `npcs`,
 * `locations`, `factions`, `quest_beats`, `party`), so no invalidation of
 * theirs can reach this key by prefix, and listening for all of them would
 * re-run a six-table search on every party HP tick. So this does not stay
 * cached: `staleTime: 0` with `refetchOnMount: "always"` reads fresh each time
 * the section mounts. That is always enough here, because the section lives
 * on an entity's detail surface and every edit that could add or remove a
 * mention ends by navigating away (the post-mutation rule), so the next time
 * the DM opens the entity they get a new read.
 */
const KIND_ORDER: Record<BacklinkKind, number> = {
  note: 0,
  npc: 1,
  location: 2,
  faction: 3,
  "quest-beat": 4,
  "party-member": 5,
};

interface NoteRow {
  id: string;
  title: string;
  content: string | null;
}

async function fetchNoteBacklinks(campaignId: string, id: string): Promise<EntityBacklink[]> {
  const { data, error } = await supabase
    .from("notes")
    .select("id, title, content")
    .eq("campaign_id", campaignId)
    .like("content", `%${id}%`);
  if (error) throw error;

  return ((data ?? []) as NoteRow[])
    .filter((note) => contentMentionsEntity(note.content, id))
    .map((note) => ({
      kind: "note" as const,
      id: note.id,
      title: note.title || "Untitled note",
      to: `/notes/${note.id}`,
    }));
}

interface NpcRow {
  id: string;
  name: string;
  appearance: string | null;
  personality: string | null;
  backstory: string | null;
  notes: string | null;
}

async function fetchNpcBacklinks(campaignId: string, id: string): Promise<EntityBacklink[]> {
  const { data, error } = await supabase
    .from("npcs")
    .select("id, name, appearance, personality, backstory, notes")
    .eq("campaign_id", campaignId)
    .neq("id", id)
    .or(`appearance.like.%${id}%,personality.like.%${id}%,backstory.like.%${id}%,notes.like.%${id}%`);
  if (error) throw error;

  return ((data ?? []) as NpcRow[])
    .filter(
      (npc) =>
        npc.id !== id &&
        (contentMentionsEntity(npc.appearance, id) ||
          contentMentionsEntity(npc.personality, id) ||
          contentMentionsEntity(npc.backstory, id) ||
          contentMentionsEntity(npc.notes, id)),
    )
    .map((npc) => ({ kind: "npc" as const, id: npc.id, title: npc.name, to: `/npcs/${npc.id}` }));
}

interface LocationRow {
  id: string;
  name: string;
  description: string | null;
}

async function fetchLocationBacklinks(campaignId: string, id: string): Promise<EntityBacklink[]> {
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, description")
    .eq("campaign_id", campaignId)
    .neq("id", id)
    .like("description", `%${id}%`);
  if (error) throw error;

  return ((data ?? []) as LocationRow[])
    .filter((loc) => loc.id !== id && contentMentionsEntity(loc.description, id))
    .map((loc) => ({ kind: "location" as const, id: loc.id, title: loc.name, to: placeRoute(loc.id) }));
}

interface FactionRow {
  id: string;
  name: string;
  description: string | null;
}

async function fetchFactionBacklinks(campaignId: string, id: string): Promise<EntityBacklink[]> {
  const { data, error } = await supabase
    .from("factions")
    .select("id, name, description")
    .eq("campaign_id", campaignId)
    .neq("id", id)
    .like("description", `%${id}%`);
  if (error) throw error;

  return ((data ?? []) as FactionRow[])
    .filter((faction) => faction.id !== id && contentMentionsEntity(faction.description, id))
    .map((faction) => ({
      kind: "faction" as const,
      id: faction.id,
      title: faction.name,
      to: `/factions/${faction.id}`,
    }));
}

interface QuestBeatRow {
  id: string;
  title: string;
  quest_id: string;
  dm_content: string | null;
  read_aloud: string | null;
  how_it_plays: string | null;
  quest: { title: string } | null;
}

async function fetchQuestBeatBacklinks(campaignId: string, id: string): Promise<EntityBacklink[]> {
  // quest_beats carries its own campaign_id (no join needed to scope), but the
  // backlink's title wants the parent quest's title too — the same disambiguating
  // FK hint `useBeatsStagedAt.ts` uses, since quest_beats has more than one path
  // to `quests`.
  const { data, error } = await supabase
    .from("quest_beats")
    .select("id, title, quest_id, dm_content, read_aloud, how_it_plays, quest:quests!quest_beats_quest_campaign_fkey(title)")
    .eq("campaign_id", campaignId)
    .or(`dm_content.like.%${id}%,read_aloud.like.%${id}%,how_it_plays.like.%${id}%`);
  if (error) throw error;

  return ((data ?? []) as unknown as QuestBeatRow[])
    .filter(
      (beat) =>
        contentMentionsEntity(beat.dm_content, id) ||
        contentMentionsEntity(beat.read_aloud, id) ||
        contentMentionsEntity(beat.how_it_plays, id),
    )
    .map((beat) => ({
      kind: "quest-beat" as const,
      id: beat.id,
      title: `${beat.quest?.title || "Untitled quest"} · ${beat.title}`,
      to: `/quests/${beat.quest_id}/beats/${beat.id}`,
    }));
}

interface PartyMemberRow {
  id: string;
  name: string;
  physical_description: string | null;
  personality_traits: string | null;
  ideals: string | null;
  bonds: string | null;
  flaws: string | null;
  notes: string | null;
}

async function fetchPartyMemberBacklinks(campaignId: string, id: string): Promise<EntityBacklink[]> {
  const { data, error } = await supabase
    .from("party_members")
    .select("id, name, physical_description, personality_traits, ideals, bonds, flaws, notes")
    .eq("campaign_id", campaignId)
    .neq("id", id)
    .or(
      `physical_description.like.%${id}%,personality_traits.like.%${id}%,ideals.like.%${id}%,bonds.like.%${id}%,flaws.like.%${id}%,notes.like.%${id}%`,
    );
  if (error) throw error;

  return ((data ?? []) as PartyMemberRow[])
    .filter(
      (pm) =>
        pm.id !== id &&
        (contentMentionsEntity(pm.physical_description, id) ||
          contentMentionsEntity(pm.personality_traits, id) ||
          contentMentionsEntity(pm.ideals, id) ||
          contentMentionsEntity(pm.bonds, id) ||
          contentMentionsEntity(pm.flaws, id) ||
          contentMentionsEntity(pm.notes, id)),
    )
    .map((pm) => ({ kind: "party-member" as const, id: pm.id, title: pm.name, to: `/party/${pm.id}` }));
}

export function useEntityBacklinks(entityId: MaybeRefOrGetter<string | null | undefined>) {
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useQuery({
    queryKey: computed(() => [KEY_ROOT, activeCampaignId.value, toValue(entityId)] as const),
    queryFn: async ({ queryKey: [, campaignId, id] }): Promise<EntityBacklink[]> => {
      if (!campaignId || !id) return [];

      const results = await Promise.all([
        fetchNoteBacklinks(campaignId, id),
        fetchNpcBacklinks(campaignId, id),
        fetchLocationBacklinks(campaignId, id),
        fetchFactionBacklinks(campaignId, id),
        fetchQuestBeatBacklinks(campaignId, id),
        fetchPartyMemberBacklinks(campaignId, id),
      ]);

      return results
        .flat()
        .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title));
    },
    enabled: () => !!activeCampaignId.value && !!toValue(entityId),
    staleTime: 0,
    refetchOnMount: "always",
  });
}
