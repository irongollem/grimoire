export function safeQuestReturnTo(value: unknown, fallback: string) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : fallback;
}

export function withQuestReturnTo(path: string, returnTo: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}returnTo=${encodeURIComponent(returnTo)}`;
}

export interface QuestLinkOptions {
  beat?: string;
  edge?: string;
  /** Open the drawer wide, on `beat` or (with no beat) on the quest itself. */
  open?: boolean;
  /** Open the drawer on the party's current beat (what "Run" and "Resume" mean). */
  party?: boolean;
  thread?: string;
}

/**
 * The one builder of a link into a quest. The quest is a single screen and the
 * URL is its selection: `?beat=` a beat, `?edge=` a route, `&open=1` the drawer
 * opened on that beat, `?open=party` the drawer opened on wherever the party
 * stands (on `&thread=`, else the primary live thread).
 */
export function questLink(questId: string, opts: QuestLinkOptions = {}): { path: string; query: Record<string, string> } {
  const query: Record<string, string> = {};
  if (opts.beat) query.beat = opts.beat;
  if (opts.edge) query.edge = opts.edge;
  if (opts.party) query.open = "party";
  else if (opts.open && !opts.edge) query.open = "1";
  if (opts.thread) query.thread = opts.thread;
  return { path: `/quests/${questId}`, query };
}

/** `questLink` as a string, for a `returnTo` carried in another page's query. */
export function questLinkHref(questId: string, opts: QuestLinkOptions = {}): string {
  const { path, query } = questLink(questId, opts);
  const search = new URLSearchParams(query).toString();
  return search ? `${path}?${search}` : path;
}
