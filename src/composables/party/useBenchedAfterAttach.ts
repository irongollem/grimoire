import { nextTick, ref } from "vue";
import { pendingReviews, useCharacterContentReviews } from "@/composables/party/useCharacterContentReviews";

/**
 * What the player is told when the table's approval review benched a character
 * that was just attached (#943). One sentence for every place a character can be
 * attached (creation, the pool card, joining a table), so the wording cannot drift.
 * A caller that cannot name the character or the table passes null for it.
 */
export function benchedMessage(name: string | null, table: string | null, waiting: number): string {
  const choices = waiting === 1 ? "1 choice is" : `${waiting} choices are`;
  return `${name ?? "Your character"} joined ${table ?? "the table"}, but ${choices} waiting for the DM's approval. They cannot be made active yet.`;
}

/**
 * How many choices wait on the DM for a character, read straight after it was
 * attached. The review runs inside the attach, so one read afterwards says
 * whether the table benched it. The caller decides what a failed read means:
 * it is no reason to undo an attach that succeeded.
 */
export function useBenchedAfterAttach() {
  const attachedId = ref<string | null>(null);
  const { refetch } = useCharacterContentReviews(attachedId);

  async function waitingAfterAttach(partyMemberId: string): Promise<number> {
    attachedId.value = partyMemberId;
    // The query is enabled by the id; let it observe the new key before refetching.
    await nextTick();
    const { data } = await refetch({ throwOnError: true });
    return pendingReviews(data).length;
  }

  return { waitingAfterAttach };
}
