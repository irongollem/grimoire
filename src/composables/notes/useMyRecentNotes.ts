import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import type { RouteLocationRaw } from "vue-router";
import { toPlainText } from "@/ai/utils";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { mentionTypeForNote, type MentionNameType } from "./useMentionName";
import { isBlankNote } from "./useMyEntityNote";
import { useMyJournalEntries, type PlayerJournalEntry } from "./usePlayerJournal";
import type { EntityNote } from "@/types/faction.types";

interface RecentNoteBase {
  id: string;
  excerpt: string;
  visibility: "private" | "party" | "dm";
  updatedAt: string;
  to: RouteLocationRaw | null;
}

/**
 * An entity note names its subject by type and id, not by a resolved name: each
 * row resolves its own (`useMentionName`), so a list of three notes reads only
 * the one source each needs rather than every campaign-wide list. `type` is
 * null for an `entity_type` the resolver does not know.
 */
export type RecentNote =
  | (RecentNoteBase & { source: "entity"; entity: { type: MentionNameType | null; id: string } })
  | (RecentNoteBase & { source: "journal"; label: string });

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

export function entityNoteToRecent(n: EntityNote): RecentNote {
  return {
    id: n.id,
    source: "entity",
    entity: { type: mentionTypeForNote(n.entity_type), id: n.entity_id },
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
  limit: number,
): RecentNote[] {
  return [
    ...entityNotes.filter((n) => !isBlankNote(n.content)).map((n) => entityNoteToRecent(n)),
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

/**
 * The player's most recently touched notes, entity notes and journal entries
 * together, newest first. The entity-note read is scoped to this user and
 * campaign in the query itself, never left to RLS. It is not live-synced (only
 * this user writes these rows), so it refetches when the Hearth mounts.
 */
export function useMyRecentNotes(limit = 3, enabled: () => boolean = () => true) {
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
    enabled: () => !!campaignId.value && !!userId.value && enabled(),
  });
  const journalQuery = useMyJournalEntries(enabled);

  const notes = computed(() =>
    mergeRecentNotes(entityQuery.data.value ?? [], journalQuery.data.value ?? [], limit),
  );
  const isLoading = computed(() => entityQuery.isLoading.value || journalQuery.isLoading.value);
  return { notes, isLoading };
}
