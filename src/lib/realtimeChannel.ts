import { supabase } from "@/lib/supabase";
import {
  createRealtimeHeal,
  type RealtimeHealOptions,
} from "@/lib/realtimeHeal";

type Channel = ReturnType<typeof supabase.channel>;

export interface RealtimeChannelOptions {
  topic: string;
  /** Add the feature's typed postgres/broadcast handlers. */
  bind: (channel: Channel) => Channel;
  /**
   * Re-read the smallest authoritative state after a possible event gap.
   * Omit this for ephemeral channels (Presence and one-shot waiters) where a
   * database snapshot cannot restore the channel's state or polling already
   * provides the recovery mechanism.
   */
  reconcile?: () => void;
  heal?: RealtimeHealOptions;
  /** Optional feature-specific status handling, such as chat backoff. */
  onStatus?: (status: string, error?: Error) => void;
}

export interface RealtimeChannelHandle {
  reconcile: () => void;
  stop: () => void;
}

// Topics whose previous channel is still leaving. realtime-js hands back the
// existing channel for a topic rather than a new one, and `removeChannel` only
// drops it from that registry once the server acknowledges the leave. A
// subscriber that stops and starts again on the same topic inside that window
// (a layout torn down and rebuilt by App's loading screen does exactly this)
// was given the old, already-joined channel, and the first `.on()` threw
// "cannot add `postgres_changes` callbacks … after `subscribe()`": the player
// was left with no live sync at all until a reload. So a new channel for a
// topic waits for the old one to be gone.
const leaving = new Map<string, Promise<unknown>>();

/** Drop a channel whose leave was never acknowledged, so the topic is free. */
function evict(channel: Channel): void {
  channel.teardown();
  supabase.realtime.channels = supabase.realtime.channels.filter((c) => c !== channel);
}

/**
 * Shared lifecycle for Realtime subscriptions with different payload shapes.
 * Features own payload semantics through `bind`; this owns subscribe status,
 * gap recovery, stale callback protection, wake listeners, and teardown.
 */
export function createRealtimeChannel(
  options: RealtimeChannelOptions,
): RealtimeChannelHandle {
  const { topic } = options;
  let stopped = false;
  let channel: Channel | null = null;
  const heal = options.reconcile
    ? createRealtimeHeal(options.reconcile, options.heal)
    : null;

  const start = () => {
    if (stopped) return;
    channel = options.bind(supabase.channel(topic)).subscribe((status, error) => {
      if (stopped) return;
      heal?.onStatus(status);
      options.onStatus?.(status, error);
    });
  };

  const previous = leaving.get(topic);
  if (previous) void previous.then(start);
  else start();

  return {
    reconcile: () => heal?.reconcile(),
    stop(): void {
      if (stopped) return;
      stopped = true;
      heal?.detach();
      const current = channel;
      if (!current) return;
      const removal: Promise<unknown> = supabase.removeChannel(current)
        .then((status) => { if (status !== "ok") evict(current); })
        .catch(() => evict(current))
        .finally(() => { if (leaving.get(topic) === removal) leaving.delete(topic); });
      leaving.set(topic, removal);
    },
  };
}
