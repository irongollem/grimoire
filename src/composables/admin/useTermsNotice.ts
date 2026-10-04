import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

/** What the `send-terms-notice` edge function answers, for a dry run and a real run alike. */
export interface TermsNoticeStatus {
  /** False when email is not set up (no Resend key); nothing was sent. */
  configured: boolean;
  version: string;
  changes: string[];
  /** Accounts still to mail. After a real run this is the count as it now stands. */
  pending: number;
  /** Accepted this version in the app, so not mailed. */
  alreadyAccepted: number;
  /** Already mailed about this version (after a real run, including that run). */
  alreadyNotified: number;
  /** Of `pending`, those an earlier send failed for; they are tried last. */
  previouslyFailed: number;
  sent: number;
  failed: number;
  /** The most one real run mails (the function's cap), so the UI never restates it. */
  batchSize: number;
}

const QUERY_KEY = ["admin", "terms-notice"] as const;

async function callTermsNotice(dryRun: boolean): Promise<TermsNoticeStatus> {
  const { data, error } = await supabase.functions.invoke("send-terms-notice", {
    body: { dryRun },
  });
  if (error) throw error;
  return data as TermsNoticeStatus;
}

/** The dry run: who would be mailed, with nothing sent. */
export function useTermsNoticeStatus() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => callTermsNotice(true),
    staleTime: 30_000,
  });
}

/**
 * A real run (at most 50 accounts). The response carries the fresh counts, so
 * it replaces the status rather than triggering another dry run.
 */
export function useSendTermsNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callTermsNotice(false),
    onSuccess: (data) => {
      qc.setQueryData(QUERY_KEY, data);
      qc.invalidateQueries({ queryKey: ["admin", "audit-log"] });
    },
  });
}
