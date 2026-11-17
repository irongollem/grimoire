import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { factItems, storyFromTurns, type StoredTurn } from "@/lib/table/storyFromTurns";
import { parseTablePressure } from "@/lib/table/readTableStream";
import type { StoryItem, TablePressure } from "@/lib/table/soloTypes";

export interface StoredSitting {
  id: string;
  party_member_id: string | null;
  scene_location_id: string | null;
  credits_spent: number;
  /** When the player left the table; null while the sitting goes on. */
  left_at: string | null;
  /** The clock this sitting runs against; null when the scene is under no pressure. */
  pressure: TablePressure | null;
}

export interface StoredConversation {
  sitting: StoredSitting;
  items: StoryItem[];
}

/**
 * One earlier sitting, redrawn: the session row, its turns (through `storyFromTurns`) and what it put on record.
 *
 * A snapshot, deliberately: a turn played on this screen is already on the page as live items, so a refetch that
 * returned it again would draw it twice. `staleTime: Infinity` keeps focus and reconnects from refreshing it, and
 * `gcTime: 0` keeps a cached copy from outliving the screen: coming back to the sitting reads what was played since.
 */
export function useTableConversation(sessionId: MaybeRefOrGetter<string | null>, campaignId: MaybeRefOrGetter<string | null>) {
  const auth = useAuthStore();
  const userId = computed(() => auth.user?.id ?? null);
  return useQuery({
    queryKey: computed(() => ["table-conversation", toValue(sessionId), toValue(campaignId), userId.value] as const),
    queryFn: async ({ queryKey: [, id, campaign, user] }): Promise<StoredConversation> => {
      if (!id || !campaign || !user) throw new Error("useTableConversation read without a sitting, a campaign and an account");
      const [sitting, turns, facts] = await Promise.all([
        supabase
          .from("agent_sessions")
          .select("id, party_member_id, scene_location_id, credits_spent, left_at, pressure_clock_id")
          .eq("id", id)
          .eq("user_id", user)
          .eq("campaign_id", campaign)
          .maybeSingle(),
        supabase.from("agent_turns").select("seq, role, blocks").eq("session_id", id).eq("user_id", user).order("seq", { ascending: true }),
        supabase
          .from("story_facts")
          .select("id, body")
          .eq("agent_session_id", id)
          .eq("campaign_id", campaign)
          .eq("known_to_player", true)
          .order("created_at", { ascending: true }),
      ]);
      if (sitting.error) throw sitting.error;
      if (turns.error) throw turns.error;
      if (facts.error) throw facts.error;
      if (!sitting.data) throw new Error("This sitting could not be found in this campaign.");
      const { pressure_clock_id: clockId, ...row } = sitting.data as Omit<StoredSitting, "pressure"> & { pressure_clock_id: string | null };
      // Only how full it is: its label is the narrator's note on what is coming, and stays off the page.
      let pressure: TablePressure | null = null;
      if (clockId) {
        const clock = await supabase.from("quest_clocks").select("filled, segments").eq("id", clockId).eq("campaign_id", campaign).maybeSingle();
        if (clock.error) throw clock.error;
        pressure = parseTablePressure(clock.data);
      }
      return {
        sitting: { ...row, pressure },
        // The facts follow the story: a turn carries no time of its own to interleave them by, and a fact is not a
        // line anyone said, so they gather at the foot of what was already played, before anything new.
        items: [...storyFromTurns(turns.data as StoredTurn[]), ...factItems(facts.data)],
      };
    },
    enabled: () => !!toValue(sessionId) && !!toValue(campaignId) && !!userId.value,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}
