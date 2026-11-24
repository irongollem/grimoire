import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { useConfirm } from "@/composables/useConfirm";

/**
 * "Tell the party" on a truth only this player knows (#1258 item 14): after asking, makes it known to every party
 * character. The database lets only a player whose character already knows the truth do this (42501 otherwise), so a
 * refusal toasts and changes nothing.
 */
export function useTellParty() {
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const { mutateAsync, isPending } = useMutation({
    mutationFn: async (entryId: string): Promise<number> => {
      const { data, error } = await supabase.rpc("tell_party_canon_truth", { p_entry_id: entryId });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CANON_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });

  /** Asks first; true when the party was told. A "no" writes nothing. */
  async function tellParty(truth: { id: string; title: string }): Promise<boolean> {
    const ok = await confirm(`Tell the whole party "${truth.title}"? Every character will know it, and you cannot take it back.`, {
      title: "Tell the party",
      confirmLabel: "Tell the party",
      danger: false,
    });
    if (!ok) return false;
    try {
      await mutateAsync(truth.id);
      return true;
    } catch {
      return false; // The mutation has already told the player (toast).
    }
  }

  return { tellParty, telling: isPending };
}
