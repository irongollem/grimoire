import type { CampaignMessage, FlavorMetadata } from "@/types/chat.types";

/**
 * The chat dot means "a message you have not seen".
 *
 * "Seen" is a read position, not a transition: the newest message the player
 * had in front of them, kept per campaign and persisted per viewer. The earlier
 * model compared the newest message with the previous newest in memory, so
 * anything that re-delivered history (a refetch after the phone woke, a
 * reconnect, a campaign switch) or that was read somewhere the dot did not
 * know about (a direct `chatOpen = true`) looked like news.
 * A position survives all of those: a refetch of messages at or before the
 * marker cannot light the dot, and a reload does not forget what was read.
 */
export type ReadMarker = Pick<CampaignMessage, "id" | "created_at">;

type Seen = Pick<CampaignMessage, "id" | "created_at" | "user_id" | "type" | "metadata">;

/** Orders by timestamp, then id, the same tie-break the message list sorts by. */
function after(a: ReadMarker, b: ReadMarker): boolean {
  return a.created_at > b.created_at || (a.created_at === b.created_at && a.id > b.id);
}

/**
 * Whether a message appears in the chat as a line of its own. A skill-check
 * flavour line is drawn inside the roll card that follows it, so it is never a
 * message the player could be missing.
 */
export function isDisplayedMessage(msg: Pick<CampaignMessage, "type" | "metadata">): boolean {
  if (msg.type !== "system") return true;
  return !(msg.metadata as FlavorMetadata | null)?.skill_label;
}

/** The newest message the chat displays, or null when it shows none. */
export function newestDisplayed<T extends Seen>(messages: readonly T[]): T | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isDisplayedMessage(messages[i])) return messages[i];
  }
  return null;
}

export interface UnreadInput {
  messages: readonly Seen[];
  /** The stored read position, or null when this browser has never recorded one. */
  marker: ReadMarker | null;
  /** The chat is on screen right now (the rail or the sheet). */
  viewing: boolean;
  myUserId: string | undefined;
}

export interface UnreadResult {
  unread: boolean;
  /** The read position after this step; persist it when it changed. */
  marker: ReadMarker | null;
}

/**
 * One step of the unread model. Viewing the chat moves the marker to the
 * newest message. With no marker yet, the history already on hand counts as
 * read, so a first visit does not light the dot for the whole backlog. Otherwise
 * the dot lights only for a displayed message from someone else that is newer
 * than the marker.
 */
export function resolveChatUnread({ messages, marker, viewing, myUserId }: UnreadInput): UnreadResult {
  const newest = newestDisplayed(messages);
  if (!newest) return { unread: false, marker };
  const newestMarker: ReadMarker = { id: newest.id, created_at: newest.created_at };
  if (viewing || !marker) return { unread: false, marker: newestMarker };
  const unread = messages.some(
    (m) => isDisplayedMessage(m) && m.user_id !== myUserId && after(m, marker),
  );
  return { unread, marker };
}

const KEY_PREFIX = "grimoire:chat-read";

function key(userId: string, campaignId: string): string {
  return `${KEY_PREFIX}:${userId}:${campaignId}`;
}

/** Storage can be absent or throw (private windows, blocked site data). */
export function loadReadMarker(userId: string, campaignId: string): ReadMarker | null {
  try {
    const raw = localStorage.getItem(key(userId, campaignId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" && parsed !== null &&
      "id" in parsed && typeof parsed.id === "string" &&
      "created_at" in parsed && typeof parsed.created_at === "string"
    ) {
      return { id: parsed.id, created_at: parsed.created_at };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveReadMarker(userId: string, campaignId: string, marker: ReadMarker): void {
  try {
    localStorage.setItem(key(userId, campaignId), JSON.stringify(marker));
  } catch {
    // The dot falls back to "first visit" semantics next load; nothing to tell the player.
  }
}
