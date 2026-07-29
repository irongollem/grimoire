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
  channel: Channel;
  reconcile: () => void;
  stop: () => void;
}

/**
 * Shared lifecycle for Realtime subscriptions with different payload shapes.
 * Features own payload semantics through `bind`; this owns subscribe status,
 * gap recovery, stale callback protection, wake listeners, and teardown.
 */
export function createRealtimeChannel(
  options: RealtimeChannelOptions,
): RealtimeChannelHandle {
  let stopped = false;
  const heal = options.reconcile
    ? createRealtimeHeal(options.reconcile, options.heal)
    : null;
  let channel = options.bind(supabase.channel(options.topic));

  channel = channel.subscribe((status, error) => {
    if (stopped) return;
    heal?.onStatus(status);
    options.onStatus?.(status, error);
  });

  return {
    channel,
    reconcile: () => heal?.reconcile(),
    stop(): void {
      if (stopped) return;
      stopped = true;
      heal?.detach();
      void supabase.removeChannel(channel);
    },
  };
}
