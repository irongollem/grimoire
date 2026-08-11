import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

/**
 * The pinned action vocabulary (`admin_audit_log_action_check`). Adding a value
 * means extending the CHECK constraint in the migration that adds its writer —
 * this union exists so the viewer's labels and filter stay in step with it, and
 * so a typo here is a type error rather than a row that never matches.
 */
export const ADMIN_AUDIT_ACTIONS = [
  "account_erasure",
  "plan_change",
  "account_freeze",
  "account_unfreeze",
  "account_ban",
  "account_unban",
  "credit_grant",
  "credit_pack_refund",
  "dsr_request_logged",
  "dsr_request_answered",
] as const;

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

/**
 * One entry in the admin action audit log (#642).
 *
 * Both ids are nullable and for different reasons, which matters when rendering:
 * `admin_user_id` is `ON DELETE SET NULL` and is also null for a *self*-initiated
 * erasure (the actor was the target, and the target is gone) — `details.actor_kind`
 * is what still says which. `target_user_id` is deliberately not an FK, so it
 * survives the account it names; that is the receipt the erasure record exists to
 * be, and it means a target id here often resolves to nobody.
 */
export interface AdminAuditEntry {
  id: string;
  admin_user_id: string | null;
  action: AdminAuditAction;
  target_user_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

/**
 * Most recent entries first. Capped rather than paginated: this log gains a row
 * per privileged admin action in a single-operator app, so the cap is years of
 * headroom — but it is a cap, so the tab says so rather than quietly showing a
 * truncated history as if it were the whole one.
 */
export const ADMIN_AUDIT_LIMIT = 200;

/**
 * Read directly rather than through an RPC: `admin_audit_log_select` already
 * resolves to `private.is_app_admin()`, so a SECURITY DEFINER wrapper would add
 * a function to the public RPC surface purely to re-implement a check RLS is
 * doing correctly. (Same reasoning as `useAdminBugReports`.)
 */
export function useAdminAuditLog() {
  return useQuery({
    queryKey: ["admin", "audit-log"],
    queryFn: async (): Promise<AdminAuditEntry[]> => {
      const { data, error } = await supabase
        .from("admin_audit_log")
        .select("id, admin_user_id, action, target_user_id, details, created_at")
        .order("created_at", { ascending: false })
        .limit(ADMIN_AUDIT_LIMIT);
      if (error) throw error;
      return (data ?? []) as AdminAuditEntry[];
    },
    staleTime: 30_000,
  });
}

/** Human labels for the pinned vocabulary. */
export const ADMIN_AUDIT_LABELS: Record<AdminAuditAction, string> = {
  account_erasure: "Account erased",
  plan_change: "Plan changed",
  account_freeze: "Account frozen",
  account_unfreeze: "Account unfrozen",
  account_ban: "Locked out",
  account_unban: "Unlocked",
  credit_grant: "Credits granted",
  credit_pack_refund: "Pack refunded",
  dsr_request_logged: "Data request recorded",
  dsr_request_answered: "Data request answered",
};
