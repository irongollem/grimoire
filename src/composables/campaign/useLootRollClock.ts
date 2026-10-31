import { onScopeDispose, watch } from "vue";
import { reportHandledError } from "@/lib/observability/sentry";
import type { CampaignMessage, ItemDropMetadata } from "@/types/chat.types";

/** Past the deadline by this much, so the server's own clock has certainly passed it. */
const GRACE_MS = 250;
/** Client clock ahead of the server: the roll is still open when we ask. Ask again. */
const RETRY_MS = 2000;
const MAX_ATTEMPTS = 5;

/**
 * Resolves Need or Greed rolls at their deadline.
 *
 * Every open client runs this on purpose: `resolve_loot_roll` is idempotent, and
 * the drop must resolve even when the DM is away. The call is a background
 * nudge, so a failure is reported to Sentry but never toasted.
 */
export function useLootRollClock(
  messages: { readonly value: CampaignMessage[] },
  resolve: (messageId: string) => Promise<ItemDropMetadata>,
) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Ids already scheduled, including ones mid-call or out of attempts, so a later message change never re-arms them. */
  const handled = new Set<string>();

  function clear(id: string) {
    handled.delete(id);
    const t = timers.get(id);
    if (t === undefined) return;
    clearTimeout(t);
    timers.delete(id);
  }

  function schedule(id: string, delayMs: number, attempt: number) {
    timers.set(id, setTimeout(() => void fire(id, attempt), delayMs));
  }

  async function fire(id: string, attempt: number) {
    timers.delete(id);
    try {
      const meta = await resolve(id);
      if (handled.has(id) && meta.roll && meta.roll.resolved_at === null && attempt < MAX_ATTEMPTS) {
        // The watcher cannot see a patch that left the roll open, so retry here.
        schedule(id, RETRY_MS, attempt + 1);
      }
    } catch (e) {
      reportHandledError(e, "loot-roll-resolve", { messageId: id });
    }
  }

  watch(
    () => messages.value
      .filter(m => m.type === "item_drop")
      .flatMap(m => {
        const roll = (m.metadata as ItemDropMetadata | null)?.roll;
        return roll && roll.resolved_at === null ? [`${m.id}|${roll.closes_at}`] : [];
      }),
    (open) => {
      const openIds = new Set(open.map(k => k.split("|")[0]));
      for (const id of handled) if (!openIds.has(id)) clear(id);
      for (const key of open) {
        const [id, closesAt] = key.split("|");
        if (handled.has(id)) continue;
        handled.add(id);
        const msLeft = new Date(closesAt).getTime() - Date.now();
        schedule(id, msLeft > 0 ? msLeft + GRACE_MS : 0, 1);
      }
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    for (const id of handled) clear(id);
  });
}
