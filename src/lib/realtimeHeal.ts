/**
 * Shared self-heal for Realtime channels — what keeps a client from stranding
 * on stale data after a gap in the event stream (#579).
 *
 * Realtime is a notification layer, not a delivery guarantee. A dropped socket,
 * a network switch, or a backgrounded tab whose socket the browser froze all
 * silently skip events, and nothing downstream can tell the difference between
 * "nothing happened" and "I missed it". Without recovery the only way back is a
 * manual page refresh — which is exactly the habit players had formed.
 *
 * Three signals imply a possible gap, and this module owns all three:
 *
 *   1. **A re-SUBSCRIBED after the initial join.** The channel rejoined, so
 *      whatever happened while it was away never arrived. The first SUBSCRIBED
 *      is skipped: the caller's own initial fetch already covers it.
 *   2. **`online` after a real outage.** Coming back from a network loss implies
 *      a gap — but only a loss we either measured as longer than a browser
 *      hiccup, or never saw begin at all (see `minOfflineMs`).
 *   3. **Returning to a visible tab** — but only when the channel actually
 *      reported a problem, or the tab was hidden long enough that the browser
 *      could have frozen the socket without ever telling us. Routine alt-tabbing
 *      must not trigger a refetch burst.
 *
 * Extracted from `useCampaignLiveSync`, which was the only channel that had any
 * of this — the composables carrying the *player* experience had none, which is
 * why players were the ones reaching for refresh.
 *
 * Also drives query-cache recovery in `App.vue`, which feeds no channel status
 * and relies purely on the two wake signals. TanStack Query cannot do this
 * itself here: `networkMode: "always"` (main.ts, needed because macOS falsely
 * reports offline on tab focus) makes query-core default `refetchOnReconnect`
 * to false, and `refetchOnWindowFocus` is off for the same reason.
 *
 * Deliberately a plain factory rather than a composable: channels in this
 * codebase are created in three different lifecycles (module-level singletons
 * with ref-counting, `onMounted`, and immediately on call), and a function that
 * returns a detach handle attaches to all three. It holds no Vue reactivity.
 */

/** A tab hidden at least this long may have had its socket frozen unnoticed. */
const DEFAULT_HIDDEN_RECONCILE_MS = 5 * 60 * 1000;
/** Minimum gap between reconciles, so overlapping wake signals fire once. */
const DEFAULT_THROTTLE_MS = 2000;
/**
 * An offline stretch we watched start and end within this window was a browser
 * hiccup, not an outage: macOS flaps offline→online on tab focus and after
 * sleep, and nothing was actually missed. Long enough to cover the flap, short
 * enough that any drop worth reconciling still counts.
 */
const DEFAULT_MIN_OFFLINE_MS = 5000;

export interface RealtimeHealOptions {
  /** Override how long a hidden tab must stay hidden to force recovery. */
  hiddenReconcileMs?: number;
  /** Override the minimum gap between two reconciles. */
  throttleMs?: number;
  /** Override how long a *measured* offline stretch must last to count. */
  minOfflineMs?: number;
  /** Clock injection point — tests drive this instead of waiting. */
  now?: () => number;
}

export interface RealtimeHeal {
  /**
   * Feed every `subscribe()` status through this. Tracks drops and triggers
   * recovery on a rejoin.
   */
  onStatus: (status: string) => void;
  /** Trigger recovery directly (still throttled). */
  reconcile: () => void;
  /** Remove the window/document listeners. Call before discarding the channel. */
  detach: () => void;
}

/**
 * Wire gap-detection around a channel.
 *
 * `onReconcile` should re-derive state from the DB — invalidate the relevant
 * query keys, or refetch the rows the channel feeds. It is throttled, so it is
 * safe to have several wake signals land together.
 *
 * Most features should use `createRealtimeChannel()`, which wires this helper
 * into the shared subscribe/teardown lifecycle. Call this lower-level helper
 * directly only when adapting a non-standard transport.
 */
export function createRealtimeHeal(
  onReconcile: () => void,
  options: RealtimeHealOptions = {},
): RealtimeHeal {
  const hiddenReconcileMs = options.hiddenReconcileMs ?? DEFAULT_HIDDEN_RECONCILE_MS;
  const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
  const minOfflineMs = options.minOfflineMs ?? DEFAULT_MIN_OFFLINE_MS;
  const now = options.now ?? (() => Date.now());

  let lastReconcile = 0;
  /**
   * Whether the channel reported a real problem (error/timeout/close) since the
   * last reconcile. Distinguishes a genuine gap from ordinary alt-tabbing.
   */
  let sawDrop = false;
  let hasJoined = false;
  /** When the tab went hidden, so a return can measure the blind window. */
  let hiddenAt: number | null = null;
  /** When `offline` fired, so `online` can measure the outage. */
  let offlineAt: number | null = null;
  let detached = false;

  const reconcile = (): void => {
    if (detached) return;
    const t = now();
    if (t - lastReconcile < throttleMs) return;
    lastReconcile = t;
    sawDrop = false;
    onReconcile();
  };

  const onStatus = (status: string): void => {
    if (detached) return;
    // CLOSED also fires when we remove the channel ourselves. Callers detach
    // before `removeChannel()`, so by then this handle is already discarded and
    // the spurious flag has nowhere to do damage.
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      sawDrop = true;
      return;
    }
    if (status !== "SUBSCRIBED") return;
    if (hasJoined) reconcile();
    hasJoined = true;
  };

  const onOffline = (): void => {
    offlineAt = now();
  };

  const onOnline = (): void => {
    // A drop we never saw begin — the machine was asleep, or the tab was frozen
    // through the whole outage — is of unknown and potentially enormous length,
    // so it always counts. Only a stretch we watched from start to finish can be
    // dismissed, and only when it was too short to have lost anything.
    const downMs = offlineAt === null ? Infinity : now() - offlineAt;
    offlineAt = null;
    if (downMs >= minOfflineMs) reconcile();
  };

  const onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") {
      hiddenAt = now();
      return;
    }
    const hiddenFor = hiddenAt !== null ? now() - hiddenAt : 0;
    hiddenAt = null;
    if (sawDrop || hiddenFor >= hiddenReconcileMs) reconcile();
  };

  // Guarded so the module stays importable under SSR, where neither exists.
  const canListen = typeof window !== "undefined" && typeof document !== "undefined";
  if (canListen) {
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  return {
    onStatus,
    reconcile,
    detach(): void {
      if (detached) return;
      detached = true;
      sawDrop = false;
      hiddenAt = null;
      offlineAt = null;
      if (!canListen) return;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
