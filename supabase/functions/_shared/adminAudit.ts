/**
 * Append an entry to `admin_audit_log` (#642).
 *
 * The other writers are SECURITY DEFINER RPCs, because the actions they record
 * are database mutations and the entry belongs in the same transaction. The two
 * actions that live in edge functions are not: a GoTrue ban and a Stripe refund
 * both happen outside Postgres, so there is no transaction to join. Here the
 * entry is written after the external call succeeds, which is the honest
 * ordering — logging first would claim a ban that GoTrue may still refuse.
 *
 * Written with the service-role client, which bypasses RLS. That is what the
 * table's complete absence of an INSERT policy is counting on: `anon` and
 * `authenticated` have no write path at all (`20260809214703` removed even the
 * table grant), so every row here comes from a definer function or from this
 * helper, called by an edge function that has already passed `requireAdmin`.
 *
 * A failed write is logged and swallowed. The alternative is failing a request
 * whose external effect has already happened — the user is banned, the money is
 * refunded — which would report a false failure and invite a retry that double-
 * refunds. A missing entry is visible in the log's continuity; a double refund
 * is not recoverable.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The values `admin_audit_log_action_check` permits for actions taken here.
 * The RPC-side actions (`plan_change`, `account_freeze`, `account_unfreeze`,
 * `credit_grant`, `account_erasure`) are written in SQL and are not in this
 * union. Adding one means extending the CHECK constraint in the same migration.
 */
export type AdminAuditAction =
  | "account_ban"
  | "account_unban"
  | "credit_pack_refund";

export async function recordAdminAction(
  admin: SupabaseClient,
  entry: {
    /** The acting admin, from the verified JWT — never from the request body. */
    adminUserId: string;
    action: AdminAuditAction;
    targetUserId: string;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await admin.from("admin_audit_log").insert({
    admin_user_id: entry.adminUserId,
    action: entry.action,
    target_user_id: entry.targetUserId,
    details: entry.details ?? {},
  });
  if (error) {
    console.error(`admin_audit_log write failed (${entry.action}):`, error.message);
  }
}
