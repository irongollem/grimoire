import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

/**
 * Pro-waitlist removal on direct request (#638).
 *
 * The list itself is not read here and there is no viewer for it. That is the
 * point: `pro_waitlist` is a set of bare addresses collected from logged-out
 * visitors for one email, and an admin screen listing them would turn a
 * purpose-bound capture into a browsable mailing list. The operator already
 * knows the address — it arrived in the mail asking to be removed.
 *
 * The self-serve route is the unsubscribe link in the mailing itself
 * (`waitlist-unsubscribe` Edge Function); this covers only the people who write
 * to info@ instead, which is what the privacy policy tells them to do.
 */
export interface RemoveWaitlistEmailInput {
  email: string;
  /** Recorded in admin_audit_log alongside the count. The address never is. */
  reason?: string | null;
}

export function useRemoveWaitlistEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    /** Resolves to the number of rows removed — 0 means the address was not on the list. */
    mutationFn: async (input: RemoveWaitlistEmailInput): Promise<number> => {
      const { data, error } = await supabase.rpc("admin_remove_waitlist_email", {
        p_email: input.email,
        p_reason: input.reason?.trim() || "requested_by_email",
      });
      if (error) throw error;
      // The RPC returns a non-null integer, so a missing count means the call
      // did not do what its type says. Coercing it to 0 would report "not on the
      // list" for a removal whose outcome is unknown.
      if (typeof data !== "number") {
        throw new Error("admin_remove_waitlist_email returned no row count");
      }
      return data;
    },
    // The removal writes an admin_audit_log entry, so the audit tab is stale the
    // moment this succeeds.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "audit-log"] }),
  });
}
