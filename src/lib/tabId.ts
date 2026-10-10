/**
 * This browser tab's id, sent with every Supabase request as `x-grimoire-tab`.
 *
 * The campaign doorbell (#999 4.2) records it on each ring, so the tab whose
 * save caused a ring can recognise its own echo and skip the refetch: its
 * mutation already refreshed what it changed, and refetching a record the DM
 * is still typing into is the one thing a live channel must not do. A write
 * from a definer path or an Edge Function carries no tab, so every tab hears it.
 *
 * Per tab, not per user: a DM with the campaign open on a laptop and a phone
 * must see the laptop's edit arrive on the phone. The server accepts only
 * `[A-Za-z0-9_-]{1,64}` (private.ring_campaigns).
 */
export const TAB_ID: string = crypto.randomUUID().replaceAll("-", "").slice(0, 24);
