import { computed, watch, type MaybeRefOrGetter, toValue } from "vue";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import type { CanonEntry } from "@/types/canon.types";

/**
 * A character's backstory entry (#1226 story 10). A player cannot write `canon_entries`, so the entry is made by
 * `open_backstory`, which makes it on first use for the campaign's DMs and that character's player, and answers the
 * existing one after that.
 */
export async function openBackstory(partyMemberId: string): Promise<string> {
  const { data, error } = await supabase.rpc("open_backstory", { p_party_member_id: partyMemberId });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("open_backstory answered without an entry");
  return data;
}

export function useOpenBackstory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: openBackstory,
    onSuccess: () => qc.invalidateQueries({ queryKey: [CANON_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

/**
 * The DM's side: the backstory entry of one character, made the first time the DM opens a character without one. The
 * entry is `null` until it exists.
 */
export function useBackstoryEntry(partyMemberId: MaybeRefOrGetter<string>) {
  const { data: entries, isSuccess } = useCanonEntries();
  const { mutate: open, isPending: opening } = useOpenBackstory();
  const entry = computed<CanonEntry | null>(() => (entries.value ?? []).find((e) => e.part === "backstory" && e.party_member_id === toValue(partyMemberId)) ?? null);
  watch(
    [isSuccess, entry, () => toValue(partyMemberId)],
    ([loaded, found, member]) => {
      if (loaded && found === null && !opening.value) open(member);
    },
    { immediate: true },
  );
  return { entry, opening };
}
