import type { CampaignMessage } from "@/types/chat.types";

type Newest = Pick<CampaignMessage, "id" | "created_at" | "user_id"> | null;

/**
 * Whether the newest message is a live arrival that should light the chat dot.
 *
 * `useCampaignMessages` mutates its array in place (push + sort), so a watcher
 * on the array itself never fires for a live INSERT. Watch the newest message
 * instead and compare it with the one seen last time. Three non-arrivals must
 * not light the dot: the first load (no previous newest), a delete that
 * promotes an older message to newest, and the user's own message.
 */
export function isUnreadArrival(prev: Newest, next: Newest, myUserId: string | undefined): boolean {
  if (!prev || !next || prev.id === next.id) return false;
  if (next.created_at <= prev.created_at) return false;
  return next.user_id !== myUserId;
}
