import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import { dmNoteEntry, type DmNoteEntityType } from "@/lib/dmNotes/registry";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import type { EntityNote } from "@/types/faction.types";
import { isBlankNote } from "./useMyEntityNote";

export interface OtherDmNote {
  id: string;
  authorId: string;
  /** "Jeffrey's note"; the author has no display name on the campaign. */
  heading: string;
  content: string;
}

/**
 * The other DMs' private notes on one entity (#590), for a stand-in at the
 * table. Read-only: the RLS arm that lets a DM read a co-DM's private note
 * grants no write. Only entity-note-kind entities have per-DM notes; a column
 * note is one shared text on the entity's own row, and an app-wide hero's note
 * belongs to each DM alone, so neither asks.
 *
 * The key starts with `entity-notes`, which the campaign doorbell already
 * refreshes, so a co-DM's edit reaches this screen without a poll.
 */
export function useOtherDmNotes(subject: MaybeRefOrGetter<{ type: DmNoteEntityType; id: string } | null>) {
  const auth = useAuthStore();
  const campaign = useCampaignStore();
  const members = useCampaignMembers();

  const perDm = computed(() => {
    const s = toValue(subject);
    if (!s) return false;
    const store = dmNoteEntry(s.type).store;
    return store.kind === "entity_note" && store.campaignTable !== null;
  });

  const query = useQuery({
    queryKey: computed(
      () =>
        [
          "entity-notes",
          toValue(subject)?.type ?? null,
          toValue(subject)?.id ?? null,
          "other-dms",
          campaign.activeCampaignId,
          auth.user?.id ?? null,
        ] as const,
    ),
    queryFn: async ({ queryKey: [, type, id, , campaignId, userId] }): Promise<EntityNote[]> => {
      if (!type || !id || !campaignId || !userId) throw new Error("useOtherDmNotes fetched without a subject");
      const { data, error } = await supabase
        .from("entity_notes")
        .select("*")
        .eq("campaign_id", campaignId)
        .eq("entity_type", type)
        .eq("entity_id", id)
        .eq("written_as_dm", true)
        .neq("user_id", userId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as EntityNote[];
    },
    enabled: () => perDm.value && !!campaign.activeCampaignId && !!auth.user?.id,
  });

  const notes = computed<OtherDmNote[]>(() =>
    (query.data.value ?? [])
      .filter((n): n is EntityNote & { content: string } => n.content !== null && !isBlankNote(n.content))
      .map((n) => {
        const name = members.data.value?.find((m) => m.user_id === n.user_id)?.display_name?.trim();
        return {
          id: n.id,
          authorId: n.user_id,
          heading: name ? `${name}'s note` : "Another DM's note",
          content: n.content,
        };
      }),
  );

  return { notes, isLoading: query.isLoading };
}
