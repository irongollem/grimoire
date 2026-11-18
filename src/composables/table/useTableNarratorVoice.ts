import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { useStorage } from "@vueuse/core";
import { supabase } from "@/lib/supabase";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { useAuthStore } from "@/stores/auth";

/** The two voices a table may give its Narrator (`agent_sessions.narrator_voice`). */
export type NarratorVoice = "male" | "female";

export const NARRATOR_VOICE_OPTIONS: ReadonlyArray<{ value: NarratorVoice; label: string }> = [
  { value: "male", label: "A man's voice" },
  { value: "female", label: "A woman's voice" },
];

function isNarratorVoice(raw: unknown): raw is NarratorVoice {
  return raw === "male" || raw === "female";
}

// What this device's host chose last, which is what the next new table begins on. The table's own row is the truth
// once a table exists: the voice is the table's, never a player's (the maintainer, 18 Nov 2026: a voice per player
// would make and bill every narrated line twice), so this is only the starting choice.
const preferred = useStorage<NarratorVoice>("grimoire:ai-table-narrator-voice", "male", safeLocalStorage());

/**
 * The Narrator's voice (#1021 row 21). With no table yet (`sessionId` null) it is the choice the next table starts
 * on; at a table it is that table's own, read from its row and changed on it by the host.
 */
export function useTableNarratorVoice(sessionId: MaybeRefOrGetter<string | null>) {
  const auth = useAuthStore();
  const client = useQueryClient();
  const userId = computed(() => auth.user?.id ?? null);
  const key = computed(() => ["table-narrator-voice", toValue(sessionId), userId.value] as const);

  const stored = useQuery({
    queryKey: key,
    queryFn: async ({ queryKey: [, id, user] }): Promise<NarratorVoice> => {
      if (!id || !user) throw new Error("useTableNarratorVoice read without a table and a signed-in account");
      const { data, error } = await supabase.from("agent_sessions").select("narrator_voice").eq("id", id).eq("user_id", user).maybeSingle();
      if (error) throw error;
      if (!data || !isNarratorVoice(data.narrator_voice)) throw new Error("This table's narrator voice could not be read.");
      return data.narrator_voice;
    },
    enabled: () => !!toValue(sessionId) && !!userId.value,
    // Only this account writes it, through `choose` below, which keeps the cache right.
    staleTime: Infinity,
  });

  const change = useMutation({
    mutationFn: async (voice: NarratorVoice): Promise<NarratorVoice> => {
      const id = toValue(sessionId);
      const user = userId.value;
      if (!id || !user) throw new Error("useTableNarratorVoice changed without a table and a signed-in account");
      // `select` so a row that was not changed (not this account's table) is an error, not a silent nothing.
      const { data, error } = await supabase.from("agent_sessions").update({ narrator_voice: voice }).eq("id", id).eq("user_id", user).select("id");
      if (error) throw error;
      if (data.length !== 1) throw new Error("Only the table's host can change the Narrator's voice.");
      return voice;
    },
    onSuccess: (voice) => client.setQueryData(key.value, voice),
  });

  /** The voice in force: the table's own once it is read, else what a new table would begin on. */
  const voice = computed<NarratorVoice>(() => (toValue(sessionId) === null ? preferred.value : (stored.data.value ?? preferred.value)));

  /** Chooses the voice: for the next table when there is none, on the table's row when there is. */
  async function choose(next: NarratorVoice): Promise<void> {
    if (toValue(sessionId) !== null) await change.mutateAsync(next);
    preferred.value = next;
  }

  return { voice, choose, changing: change.isPending, error: change.error };
}
