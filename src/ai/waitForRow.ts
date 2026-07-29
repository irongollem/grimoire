import { supabase } from "@/lib/supabase";
import { createRealtimeChannel, type RealtimeChannelHandle } from "@/lib/realtimeChannel";

/**
 * Generic "wait for a row to settle" machine: subscribes to Realtime
 * postgres_changes UPDATE events on `${table}` (id=eq.${id}) and polls the
 * row on an interval as a fallback, resolving when `resolveWhen` matches and
 * rejecting when `rejectWhen` returns an error message (or on timeout).
 * Shared by src/ai/useImageJob.ts and src/ai/useMiniForge.ts.
 */
export function waitForRow<Row>(opts: {
  table: string;
  id: string;
  select: string;
  resolveWhen: (row: Row) => boolean;
  rejectWhen: (row: Row) => string | null;
  timeoutMs: number;
  timeoutMessage: string;
  pollIntervalMs?: number;
}): Promise<Row> {
  const { table, id, select, resolveWhen, rejectWhen, timeoutMs, timeoutMessage } = opts;
  const pollIntervalMs = opts.pollIntervalMs ?? 4_000;

  return new Promise((resolve, reject) => {
    let settled = false;
    let pollHandle: ReturnType<typeof setInterval> | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let realtime: RealtimeChannelHandle | null = null;

    const cleanup = () => {
      if (pollHandle) clearInterval(pollHandle);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      realtime?.stop();
      realtime = null;
    };

    const settle = (row: Row | null) => {
      if (settled || !row) return;
      if (resolveWhen(row)) {
        settled = true;
        cleanup();
        resolve(row);
        return;
      }
      const failure = rejectWhen(row);
      if (failure !== null) {
        settled = true;
        cleanup();
        reject(new Error(failure));
      }
    };

    const checkOnce = async () => {
      const { data } = await supabase
        .from(table)
        .select(select)
        .eq("id", id)
        .maybeSingle();
      settle(data as Row | null);
    };

    // This is deliberately a no-reconcile channel. The initial check and poll
    // are its recovery path; attaching page/network self-healing would only
    // add duplicate reads to a short-lived waiter.
    realtime = createRealtimeChannel({
      topic: `${table}-wait:${id}`,
      bind: (channel) => channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table, filter: `id=eq.${id}` },
        (payload) => settle(payload.new as Row),
      ),
    });

    pollHandle = setInterval(checkOnce, pollIntervalMs);
    void checkOnce();

    timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });
}
