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
    // The last row this waiter has seen, from either a real SELECT (poll) or
    // a merged Realtime event — the merge baseline for the next UPDATE.
    let lastRow: Row | null = null;

    const cleanup = () => {
      if (pollHandle) clearInterval(pollHandle);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      realtime?.stop();
      realtime = null;
    };

    /**
     * `complete` distinguishes a poll's SELECT * (always the whole row) from
     * a Realtime UPDATE payload, which omits any column Postgres left
     * unchanged and stored out-of-line (TOAST) — real risk here, since
     * `select: "*"` callers (waitForSculpt) promise the caller a complete
     * row back. An incomplete event is merged over the last known row rather
     * than trusted directly.
     */
    const settle = (row: Row | null, complete: boolean) => {
      if (settled || !row) return;
      const merged = complete || !lastRow ? row : { ...lastRow, ...row };
      lastRow = merged;
      if (resolveWhen(merged)) {
        settled = true;
        cleanup();
        resolve(merged);
        return;
      }
      const failure = rejectWhen(merged);
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
      settle(data as Row | null, true);
    };

    // This is deliberately a no-reconcile channel. The initial check and poll
    // are its recovery path; attaching page/network self-healing would only
    // add duplicate reads to a short-lived waiter.
    realtime = createRealtimeChannel({
      topic: `${table}-wait:${id}`,
      bind: (channel) => channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table, filter: `id=eq.${id}` },
        (payload) => settle(payload.new as Row, false),
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
