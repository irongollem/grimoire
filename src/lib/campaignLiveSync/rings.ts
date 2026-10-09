/**
 * The campaign doorbell's in-app fan-out (#999 4.2).
 *
 * `useCampaignLiveSync` holds the one Realtime channel per campaign (the private
 * Broadcast topic `doorbellTopic(id)`) and turns each ring into query invalidations
 * through `SIGNAL_KEYS`. A few subscribers keep state outside TanStack Query (the
 * chat's message list, the encounter runner, the player's audio stream, the
 * removal guard), so they listen here instead of opening channels of their own:
 * a second channel per feature is what kept postgres_changes, and with it
 * Realtime's per-second poll, alive.
 *
 * A ring names what changed, never the row. `own` is true when this tab's own
 * request caused it (see `TAB_ID`); a listener whose own mutation already
 * updated its state can skip those.
 */
import { TAB_ID } from "@/lib/tabId";

/**
 * The doorbell's private Broadcast topic for a campaign; the server sends to
 * the same name (private.send_campaign_rings). Not `campaign:<id>`: that is the
 * public presence channel (useCampaignPresence), and realtime-js hands back the
 * existing channel for a topic asked for twice, so sharing the name bound the
 * doorbell to the public channel, where no private ring arrives.
 */
export function doorbellTopic(campaignId: string): string {
  return `doorbell:${campaignId}`;
}

export interface CampaignRing {
  campaignId: string;
  /** The signal: usually the table that changed, sometimes a `<table>_player` projection signal. */
  table: string;
  /** The tab whose request rang, or null for a definer path or an Edge Function. */
  origin: string | null;
  /** True when this tab's own request caused the ring. */
  own: boolean;
}

type Listener = (ring: CampaignRing) => void;

const listeners = new Set<{ tables: ReadonlySet<string>; listener: Listener }>();

/**
 * Calls `listener` for every ring of any of `tables`, in any campaign this tab
 * is listening to (the caller checks `ring.campaignId`). Returns the unsubscribe.
 */
export function onCampaignRing(tables: readonly string[], listener: Listener): () => void {
  const entry = { tables: new Set(tables), listener };
  listeners.add(entry);
  return () => {
    listeners.delete(entry);
  };
}

/** Called by `useCampaignLiveSync` only, once per received ring. */
export function emitCampaignRing(campaignId: string, payload: { table?: unknown; origin?: unknown }): CampaignRing | null {
  if (typeof payload.table !== "string") return null;
  const origin = typeof payload.origin === "string" ? payload.origin : null;
  const ring: CampaignRing = { campaignId, table: payload.table, origin, own: origin === TAB_ID };
  for (const { tables, listener } of listeners) {
    if (tables.has(ring.table)) listener(ring);
  }
  return ring;
}

type ReconcileListener = (campaignId: string) => void;
const reconcilers = new Set<ReconcileListener>();

/**
 * Calls `listener` whenever the campaign channel may have missed rings (it
 * rejoined after a drop, or the tab woke after a long sleep). A subscriber with
 * state outside TanStack Query re-reads it here, the way its own channel's
 * `reconcile` used to. Returns the unsubscribe.
 */
export function onCampaignReconcile(listener: ReconcileListener): () => void {
  reconcilers.add(listener);
  return () => {
    reconcilers.delete(listener);
  };
}

/** Called by `useCampaignLiveSync` only, from the channel's own reconcile. */
export function emitCampaignReconcile(campaignId: string): void {
  for (const listener of reconcilers) listener(campaignId);
}
