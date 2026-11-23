import { reactive } from "vue";
import { useTableFactWrites } from "@/composables/canon/useTableFacts";
import { useToast } from "@/composables/useToast";
import type { StoryFact } from "@/lib/table/solo/storyRecord";

/**
 * The DM's review of a fact the table added, as every screen that offers it runs it: the Canon page's "What the table
 * added" and the story record. One set of writes, one toast per failure, and one memory of what a Strike took away so
 * Undo gives the keep back.
 *
 * `touched` lists the facts acted on this visit; a list that filters by review keeps those on screen so a Strike can be
 * undone and a Keep seen to have landed.
 */
export function useFactReview() {
  const toast = useToast();
  const writes = useTableFactWrites();
  const touched = reactive(new Set<string>());
  const keptBeforeStrike = new Map<string, string | null>();

  /** Run a write on a fact. A failure is toasted (`failure` is the words, or a function of the error) and un-lists the fact. */
  async function act(fact: StoryFact, run: () => Promise<unknown>, failure: string | ((e: unknown) => string), done?: () => void): Promise<void> {
    // Listed before the write settles: the refresh that follows it would otherwise drop the line from this filter for a moment.
    const wasListed = touched.has(fact.id);
    touched.add(fact.id);
    try {
      await run();
      done?.();
    } catch (e) {
      if (!wasListed) touched.delete(fact.id);
      toast.error(toast.fromError(e, typeof failure === "string" ? failure : failure(e)));
    }
  }

  const keep = (fact: StoryFact) => act(fact, () => writes.keep.mutateAsync(fact), "That could not be kept.");

  const strike = (fact: StoryFact) =>
    act(fact, () => writes.strike.mutateAsync(fact), "That could not be struck.", () => keptBeforeStrike.set(fact.id, fact.kept_at));

  const undo = (fact: StoryFact) =>
    act(fact, () => writes.undoStrike.mutateAsync({ fact, previousKeptAt: keptBeforeStrike.get(fact.id) ?? null }), "That could not be undone.");

  return { writes, touched, act, keep, strike, undo };
}
