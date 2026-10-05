import { computed, type ComputedRef } from "vue";
import { useQuery } from "@tanstack/vue-query";
import type { RouteLocationRaw } from "vue-router";
import { toPlainText } from "@/ai/utils";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useParty } from "@/composables/party/useParty";
import { useCompanions } from "@/composables/encounters/useCompanions";
import { useSharedNpcs } from "@/composables/npcs/useNpcs";
import { useSharedLocations } from "@/composables/locations/useLocations";
import { usePlayerVisibleFactions } from "@/composables/factions/useFactions";
import { usePlayerVisibleQuests } from "@/composables/quests/useQuests";
import { isBlankNote } from "./useMyEntityNote";
import { useMyJournalEntries, type PlayerJournalEntry } from "./usePlayerJournal";
import type { EntityNote } from "@/types/faction.types";

export interface RecentNote {
  id: string;
  source: "entity" | "journal";
  label: string;
  excerpt: string;
  visibility: "private" | "party" | "dm";
  updatedAt: string;
  to: RouteLocationRaw | null;
}

/** Resolves an entity's player-safe name, or null when this player does not know it. */
export type NameOf = (entityType: string, entityId: string) => string | null;

const EXCERPT_LENGTH = 120;

/** Plain text, cut to about `max` characters on a word boundary with an ellipsis. */
export function excerptOf(content: string | null, max = EXCERPT_LENGTH): string {
  const text = toPlainText(content).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function visibilityOf(n: { is_private: boolean; shared_with_dm: boolean }): RecentNote["visibility"] {
  if (n.shared_with_dm) return "dm";
  return n.is_private ? "private" : "party";
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** "On <name>", with "???" when the viewer does not know the entity: the same fallback the mention chip draws, never a stored or true name. */
export function entityNoteToRecent(n: EntityNote, nameOf: NameOf): RecentNote {
  return {
    id: n.id,
    source: "entity",
    label: `On ${nameOf(n.entity_type, n.entity_id) ?? "???"}`,
    excerpt: excerptOf(n.content),
    visibility: visibilityOf(n),
    updatedAt: n.updated_at,
    to: n.entity_type === "quest" ? { name: "play-quest-detail", params: { id: n.entity_id } } : null,
  };
}

export function journalEntryToRecent(e: PlayerJournalEntry): RecentNote {
  const title = e.title?.trim();
  return {
    id: e.id,
    source: "journal",
    label: title ? title : `Journal · ${dateLabel(e.updated_at)}`,
    excerpt: excerptOf(e.content),
    visibility: visibilityOf(e),
    updatedAt: e.updated_at,
    to: { name: "play-journal", query: { tab: "mine" } },
  };
}

/** Newest first across both sources, blank notes dropped, cut to `limit`. */
export function mergeRecentNotes(
  entityNotes: readonly EntityNote[],
  journal: readonly PlayerJournalEntry[],
  nameOf: NameOf,
  limit: number,
): RecentNote[] {
  return [
    ...entityNotes.filter((n) => !isBlankNote(n.content)).map((n) => entityNoteToRecent(n, nameOf)),
    ...journal.filter((e) => !isBlankNote(e.content)).map(journalEntryToRecent),
  ]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, Math.max(0, limit));
}

/** Blank notes are filtered after the read, so over-fetch to still fill `limit`. */
const OVERFETCH = 4;

async function fetchRecentEntityNotes(campaignId: string, userId: string, limit: number): Promise<EntityNote[]> {
  const { data, error } = await supabase
    .from("entity_notes")
    .select("*")
    .eq("user_id", userId)
    .eq("campaign_id", campaignId)
    .order("updated_at", { ascending: false })
    .limit(limit * OVERFETCH);
  if (error) throw error;
  return data as EntityNote[];
}

/** Player-safe name lookup over the same projections the mention chip reads. */
function useNoteNameOf(): ComputedRef<NameOf> {
  const { data: party } = useParty();
  const { data: companions } = useCompanions();
  const { data: npcs } = useSharedNpcs();
  const { data: locations } = useSharedLocations();
  const { data: factions } = usePlayerVisibleFactions();
  const { data: quests } = usePlayerVisibleQuests();
  return computed<NameOf>(() => {
    const find = (rows: ReadonlyArray<{ id: string; name?: string | null; title?: string }> | undefined, id: string) => {
      const row = rows?.find((r) => r.id === id);
      return row ? (row.name ?? row.title ?? null) : null;
    };
    return (type, id) => {
      switch (type) {
        case "party_member": return find(party.value, id);
        case "companion": return find(companions.value, id);
        case "npc": return find(npcs.value, id);
        case "location": return find(locations.value, id);
        case "faction": return find(factions.value, id);
        case "quest": return find(quests.value, id);
        default: return null;
      }
    };
  });
}

/**
 * The player's most recently touched notes, entity notes and journal entries
 * together, newest first. The entity-note read is scoped to this user and
 * campaign in the query itself, never left to RLS. It is not live-synced (only
 * this user writes these rows), so it refetches when the Hearth mounts.
 */
export function useMyRecentNotes(limit = 3) {
  const auth = useAuthStore();
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const userId = computed(() => auth.user?.id ?? null);

  const entityQuery = useQuery({
    queryKey: computed(() => ["my-recent-entity-notes", campaignId.value, userId.value, limit] as const),
    queryFn: ({ queryKey: [, cid, uid] }) => {
      if (!cid || !uid) throw new Error("useMyRecentNotes fetched without a campaign and a user");
      return fetchRecentEntityNotes(cid, uid, limit);
    },
    enabled: () => !!campaignId.value && !!userId.value,
  });
  const journalQuery = useMyJournalEntries();
  const nameOf = useNoteNameOf();

  const notes = computed(() =>
    mergeRecentNotes(entityQuery.data.value ?? [], journalQuery.data.value ?? [], nameOf.value, limit),
  );
  const isLoading = computed(() => entityQuery.isLoading.value || journalQuery.isLoading.value);
  return { notes, isLoading };
}
