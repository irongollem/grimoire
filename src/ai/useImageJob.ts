import { supabase } from "@/lib/supabase";

interface ImageJobRow {
  status: "pending" | "ready" | "failed";
  image_url: string | null;
  error: string | null;
}

/**
 * Waits for an async image_generation_jobs row to settle.
 * Subscribes via Realtime and polls every 4s as a fallback. Resolves with
 * the URL on `ready`, rejects on `failed` or timeout.
 */
export function waitForImageJob(
  jobId: string,
  opts: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<string> {
  // 8 min: gpt-image legitimately runs ~5 min on a busy day, so a tighter
  // window risks "timing out" a job that is about to succeed. A pg_cron sweep
  // is the authority that fails truly-stuck jobs (>10 min) — the client never
  // mutates job status, it only observes, so it can't clobber a late success.
  const timeoutMs = opts.timeoutMs ?? 8 * 60 * 1000;
  const pollIntervalMs = opts.pollIntervalMs ?? 4_000;

  return new Promise((resolve, reject) => {
    let settled = false;
    let pollHandle: ReturnType<typeof setInterval> | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase.channel(`image-job:${jobId}`);

    const cleanup = () => {
      if (pollHandle) clearInterval(pollHandle);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      void supabase.removeChannel(channel);
    };

    const settle = (row: ImageJobRow | null) => {
      if (settled || !row) return;
      if (row.status === "ready" && row.image_url) {
        settled = true;
        cleanup();
        resolve(row.image_url);
      } else if (row.status === "failed") {
        settled = true;
        cleanup();
        reject(new Error(row.error ?? "Image generation failed"));
      }
    };

    const checkOnce = async () => {
      const { data } = await supabase
        .from("image_generation_jobs")
        .select("status, image_url, error")
        .eq("id", jobId)
        .maybeSingle();
      settle(data as ImageJobRow | null);
    };

    channel
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "image_generation_jobs", filter: `id=eq.${jobId}` },
        (payload) => settle(payload.new as ImageJobRow),
      )
      .subscribe();

    pollHandle = setInterval(checkOnce, pollIntervalMs);
    void checkOnce();

    timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(
        "This image is taking longer than expected. It may still finish and appear in your gallery shortly — if it doesn't, the job will be marked failed automatically and you can try again.",
      ));
    }, timeoutMs);
  });
}
