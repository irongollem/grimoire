import { supabase } from "@/lib/supabase";
import { reportHandledError } from "@/lib/observability/sentry";

/**
 * How long a quest's edits must go quiet before its embedding is queued (#599).
 *
 * One vector covers a whole quest: its title, tags, summary, objectives and
 * every beat's title. Quest and beat forms autosave, so a DM typing a title or
 * summary can fire a write every second or two, and each of those changes the
 * quest's embed text. Without a pause that is twenty embed requests for one
 * sentence.
 * Trailing, so the vector is built from what the DM finished typing.
 */
export const QUEST_EMBED_DEBOUNCE_MS = 5000;

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Queue a quest for semantic-search embedding (#599). Call it after ANY write
 * to `quests` (title, tags, summary), `quest_objectives` or `quest_beats`
 * (title), including inserts and deletes: the quest's single
 * vector reads all three. Runtime play state (status, threads, clocks,
 * consequences) is not part of the embed text, so it must not call this.
 *
 * Fire-and-forget and never rejects: the write has already committed, so a
 * failed embed only leaves the quest for the admin backfill or the
 * "not indexed yet" offer. Debounced per quest (see
 * {@link QUEST_EMBED_DEBOUNCE_MS}); a pending call lost to a page close is
 * acceptable for the same reason, since the offer and the backfill collect any
 * quest whose vector is missing. The edge function short-circuits on an
 * unchanged text hash, so a redundant call costs a request and nothing else.
 */
export function queueQuestEmbedding(questId: string): void {
  const existing = pending.get(questId);
  if (existing !== undefined) clearTimeout(existing);
  pending.set(
    questId,
    setTimeout(() => {
      pending.delete(questId);
      void Promise.resolve(
        supabase.functions.invoke("embed-content", { body: { mode: "single", entity: "quest", id: questId } }),
      )
        .then(({ error }) => {
          if (error) reportHandledError(error, "queueQuestEmbedding", { questId });
        })
        .catch((error) => reportHandledError(error, "queueQuestEmbedding", { questId }));
    }, QUEST_EMBED_DEBOUNCE_MS),
  );
}
