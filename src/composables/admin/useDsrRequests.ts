import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

/**
 * The pinned request vocabulary (`dsr_requests_request_type_check`). Adding a
 * value means extending the CHECK constraint in the migration that adds its
 * writer — this union exists so the viewer's labels stay in step with it, and
 * so a typo here is a type error rather than a row that never matches.
 */
export const DSR_REQUEST_TYPES = [
  "access_portability",
  "access",
  "portability",
  "erasure",
  "rectification",
  "restriction",
  "objection",
] as const;

export type DsrRequestType = (typeof DSR_REQUEST_TYPES)[number];

export const DSR_REQUEST_LABELS: Record<DsrRequestType, string> = {
  access_portability: "Access & portability",
  access: "Access",
  portability: "Portability",
  erasure: "Erasure",
  rectification: "Rectification",
  restriction: "Restriction",
  objection: "Objection",
};

export const DSR_OUTCOMES = ["fulfilled", "partially_fulfilled", "refused", "withdrawn"] as const;
export type DsrOutcome = (typeof DSR_OUTCOMES)[number];

export const DSR_OUTCOME_LABELS: Record<DsrOutcome, string> = {
  fulfilled: "Fulfilled",
  partially_fulfilled: "Partially fulfilled",
  refused: "Refused",
  withdrawn: "Withdrawn",
};

/**
 * One data-subject request (#643).
 *
 * `user_id` is deliberately not a foreign key, so — exactly like
 * `AdminAuditEntry.target_user_id` — an id here often resolves to nobody. That
 * is the expected rendering for an erased account, not a bug: the row has to
 * outlive the person to evidence that their request was answered.
 *
 * `anonymized_at` set means the subject has since been erased; the row keeps
 * its type, dates and outcome and has lost the link to them.
 */
export interface DsrRequest {
  id: string;
  request_type: DsrRequestType;
  channel: "self_serve" | "email";
  user_id: string | null;
  subject_email: string | null;
  identity_verification: string;
  received_at: string;
  fulfilled_at: string | null;
  outcome: DsrOutcome | null;
  notes: string | null;
  anonymized_at: string | null;
}

/** Art. 12(3): one month from receipt, extendable by two. The near edge is what the tab shows. */
export const DSR_DEADLINE_DAYS = 30;

/**
 * Most recent first. Capped rather than paginated, same reasoning as the audit
 * log: a single-operator app gains a row per request, so the cap is years of
 * headroom — but it is a cap, so the tab says so.
 */
export const DSR_REQUEST_LIMIT = 200;

/** Whole days until the Art. 12(3) deadline; negative once it has passed. */
export function daysUntilDue(request: DsrRequest, now: Date): number {
  const due = new Date(request.received_at).getTime() + DSR_DEADLINE_DAYS * 86_400_000;
  return Math.ceil((due - now.getTime()) / 86_400_000);
}

/**
 * Read directly rather than through an RPC: `dsr_requests_select` already
 * resolves to `private.is_app_admin()`, so a SECURITY DEFINER wrapper would add
 * a function to the public RPC surface purely to re-implement a check RLS is
 * doing correctly. (Same reasoning as `useAdminAuditLog`.)
 */
export function useDsrRequests() {
  return useQuery({
    queryKey: ["admin", "dsr-requests"],
    queryFn: async (): Promise<DsrRequest[]> => {
      const { data, error } = await supabase
        .from("dsr_requests")
        .select(
          "id, request_type, channel, user_id, subject_email, identity_verification, received_at, fulfilled_at, outcome, notes, anonymized_at",
        )
        .order("received_at", { ascending: false })
        .limit(DSR_REQUEST_LIMIT);
      if (error) throw error;
      return (data ?? []) as DsrRequest[];
    },
    staleTime: 30_000,
  });
}

export interface LogDsrRequestInput {
  requestType: DsrRequestType;
  identityVerification: string;
  userId?: string | null;
  subjectEmail?: string | null;
  notes?: string | null;
}

/**
 * Records an email-channel request. The self-serve rights log themselves inside
 * `export_user_data` / `prepare_user_erasure`, so this covers only the requests
 * that arrive by other means and can't log themselves.
 */
export function useLogDsrRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LogDsrRequestInput): Promise<string> => {
      const { data, error } = await supabase.rpc("admin_log_dsr_request", {
        p_request_type: input.requestType,
        p_identity_verification: input.identityVerification,
        p_user_id: input.userId ?? null,
        p_subject_email: input.subjectEmail ?? null,
        p_notes: input.notes ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "dsr-requests"] }),
  });
}

/** Closes a request. One-way: the guard refuses a second answer. */
export function useFulfilDsrRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; outcome: DsrOutcome; notes?: string | null }) => {
      const { error } = await supabase.rpc("admin_fulfil_dsr_request", {
        p_id: input.id,
        p_outcome: input.outcome,
        p_notes: input.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "dsr-requests"] }),
  });
}
