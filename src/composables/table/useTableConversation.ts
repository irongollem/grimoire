import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { factItems, storyFromTurns, type StoredTurn } from "@/lib/table/storyFromTurns";
import { parseTablePressure } from "@/lib/table/readTableStream";
import { parseRollAsk } from "@/lib/table/tableRoll";
import type { RollAsk, StoryItem, TableFight, TablePressure } from "@/lib/table/soloTypes";

export interface StoredSitting {
  id: string;
  party_member_id: string | null;
  scene_location_id: string | null;
  credits_spent: number;
  /** When the player left the table; null while the sitting goes on. */
  left_at: string | null;
  /** The fight this sitting started and is waiting on; null when the story is not in one. */
  fight: TableFight | null;
  /** The clock this sitting runs against; null when the scene is under no pressure. */
  pressure: TablePressure | null;
  /** The roll the table is waiting for; never the number to beat. */
  pending_roll: RollAsk | null;
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
          .select("id, party_member_id, scene_location_id, credits_spent, left_at, pressure_clock_id, pending_roll, fight_encounter_id")
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
      // The stored request also holds the number to beat: only what `parseRollAsk` keeps goes on.
      const { pressure_clock_id: clockId, pending_roll: storedRoll, fight_encounter_id: fightId, ...row } = sitting.data as Omit<StoredSitting, "pressure" | "pending_roll" | "fight"> & {
        pressure_clock_id: string | null;
        pending_roll: unknown;
        fight_encounter_id: string | null;
      };
      // The fight the sitting is waiting on, by name, so a reload still offers the way to it. Named in the campaign.
      let fight: TableFight | null = null;
      if (fightId) {
        const encounter = await supabase.from("encounters").select("id, name").eq("id", fightId).eq("campaign_id", campaign).maybeSingle();
        if (encounter.error) throw encounter.error;
        if (encounter.data) fight = { encounterId: encounter.data.id as string, name: encounter.data.name as string };
      }
      // Only how full it is: its label is the narrator's note on what is coming, and stays off the page.
      let pressure: TablePressure | null = null;
      if (clockId) {
        const clock = await supabase.from("quest_clocks").select("filled, segments").eq("id", clockId).eq("campaign_id", campaign).maybeSingle();
        if (clock.error) throw clock.error;
        pressure = parseTablePressure(clock.data);
      }
      return {
        sitting: { ...row, pressure, fight, pending_roll: parseRollAsk(storedRoll) },
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
