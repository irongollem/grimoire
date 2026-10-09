import { supabase } from "@/lib/supabase";

/**
 * Generic "wait for a row to settle" machine: polls the row `${table}` (id=${id})
 * on an interval, resolving when `resolveWhen` matches and rejecting when
 * `rejectWhen` returns an error message (or an Error, when the caller needs the
 * failed row on it, see AiGenerationJobFailedError) or on timeout.
 *
 * It polls instead of subscribing on purpose. This waits on a server job the
 * user just started, which is one of the sanctioned polls (CLAUDE.md, Live
 * Data): there is no campaign channel to hear it on, and a Realtime
 * postgres_changes subscription is exactly what #999 4.2 removed everywhere.
 * The poll ends the moment the row settles or the timeout fires, so an idle
 * screen sends nothing.
 *
 * Shared by src/ai/useImageJob.ts, src/ai/useAiGenerationJob.ts and
 * src/ai/useMiniForge.ts.
 */
export function waitForRow<Row>(opts: {
  table: string;
  id: string;
  select: string;
  resolveWhen: (row: Row) => boolean;
  rejectWhen: (row: Row) => string | Error | null;
  timeoutMs: number;
  timeoutMessage: string;
  pollIntervalMs?: number;
}): Promise<Row> {
  const { table, id, select, resolveWhen, rejectWhen, timeoutMs, timeoutMessage } = opts;
  // Generation jobs run for tens of seconds to minutes, so a single-row primary
  // key read every 3 s is the whole cost of watching one, and 3 s is the longest
  // a finished result can sit unnoticed.
  const pollIntervalMs = opts.pollIntervalMs ?? 3_000;

  return new Promise((resolve, reject) => {
    let settled = false;
    let reading = false;
    let pollHandle: ReturnType<typeof setInterval> | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (pollHandle) clearInterval(pollHandle);
      if (timeoutHandle) clearTimeout(timeoutHandle);
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
        reject(typeof failure === "string" ? new Error(failure) : failure);
      }
    };

    const checkOnce = async () => {
      // A slow read must not stack a second one behind it.
      if (reading || settled) return;
      reading = true;
      try {
        const { data, error } = await supabase
          .from(table)
          .select(select)
          .eq("id", id)
          .maybeSingle();
        // A failed read is a missed tick, not a verdict on the job: the next
        // tick retries and the timeout still bounds the wait.
        if (!error) settle(data as Row | null);
      } finally {
        reading = false;
      }
    };

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
