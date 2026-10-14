import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

/** What the `send-inactivity-notice` edge function answers, for a dry run and a real run alike. */
export interface InactivityNoticeStatus {
  /** False when email is not set up (no Resend key); nothing was sent. */
  configured: boolean;
  /** Accounts due a deletion notice. After a real run, the count as it now stands. */
  pending: number;
  /** Of `pending`, those an earlier send failed for; they are tried last. */
  previouslyFailed: number;
  sent: number;
  failed: number;
  /** The most one real run mails (the function's cap). */
  batchSize: number;
}

const QUERY_KEY = ["admin", "inactivity-notice"] as const;

async function callInactivityNotice(dryRun: boolean): Promise<InactivityNoticeStatus> {
  const { data, error } = await supabase.functions.invoke("send-inactivity-notice", {
    body: { dryRun },
  });
  if (error) throw error;
  return data as InactivityNoticeStatus;
}

/** The dry run: who would be mailed, with nothing sent. */
export function useInactivityNoticeStatus() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => callInactivityNotice(true),
    staleTime: 30_000,
  });
}

/** A real run (at most `batchSize` accounts). The response replaces the cached status. */
export function useSendInactivityNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callInactivityNotice(false),
    onSuccess: (data) => {
      qc.setQueryData(QUERY_KEY, data);
      qc.invalidateQueries({ queryKey: ["admin", "audit-log"] });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}
