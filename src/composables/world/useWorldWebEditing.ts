import { computed } from "vue";
import {
  useCreateConnection,
  useRemoveConnection,
  useRetypeConnection,
  useUpdateLink,
  type NamedRef,
} from "@/composables/connections/useConnections";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import type { TypeChoice } from "@/lib/worldLinks/connections";
import { isLinkKind, parseNodeKey } from "@/lib/worldWeb/kinds";
import { asConnection, tieWordFrom, type WorldTie } from "@/lib/worldWeb/ties";
import type { WorldRef } from "@/types/connections.types";

/**
 * The DM's writes from the World web: tie two things, change what a tie is, say
 * what players are told about it, remove it. Where a tie lives (a link table or
 * the record that already holds it) is the connections layer's business; this
 * names two ends and a choice and reports the outcome.
 */
export function useWorldWebEditing() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const create = useCreateConnection();
  const retype = useRetypeConnection();
  const remove = useRemoveConnection();
  const update = useUpdateLink();

  const busy = computed(
    () => create.isPending.value || retype.isPending.value || remove.isPending.value || update.isPending.value,
  );

  /** A node key as a thing a link can join; null for a quest, which only has its own records. */
  function refOf(key: string): WorldRef | null {
    const ref = parseNodeKey(key);
    return ref && isLinkKind(ref.kind) ? { kind: ref.kind, id: ref.id } : null;
  }

  async function guard(action: () => Promise<unknown>, done: string): Promise<boolean> {
    try {
      await action();
      toast.success(done);
      return true;
    } catch (e) {
      toast.error(toast.fromError(e, "That did not save. Try again."));
      return false;
    }
  }

  function connect(subjectKey: string, other: NamedRef, choice: TypeChoice): Promise<boolean> {
    const subject = refOf(subjectKey);
    if (!subject) {
      toast.error("A quest says what it involves on the quest itself.");
      return Promise.resolve(false);
    }
    return guard(() => create.mutateAsync({ subject, other, choice }), "Tied together.");
  }

  function retypeTie(tie: WorldTie, subjectKey: string, choice: TypeChoice): Promise<boolean> {
    const subject = refOf(subjectKey);
    if (!subject) return Promise.resolve(false);
    return guard(() => retype.mutateAsync({ connection: asConnection(tie, subjectKey), subject, choice }), "Changed.");
  }

  async function removeTie(tie: WorldTie, subjectKey: string): Promise<boolean> {
    const subject = refOf(subjectKey);
    if (!subject) return false;
    const connection = asConnection(tie, subjectKey);
    const ok = await confirm(
      `${connection.other_name} will no longer be tied to this by "${tieWordFrom(tie, subjectKey)}".`,
      { title: "Remove this tie?", confirmLabel: "Remove" },
    );
    if (!ok) return false;
    return guard(() => remove.mutateAsync({ connection, subject }), "Removed.");
  }

  /** A link's two lines: the DM's note and what those who know of it are told. */
  function saveWords(tie: WorldTie, words: { note: string; told: string }): Promise<boolean> {
    return guard(() => update.mutateAsync({ id: tie.row_id, note: words.note, told: words.told }), "Saved.");
  }

  return { busy, refOf, connect, retypeTie, removeTie, saveWords };
}
