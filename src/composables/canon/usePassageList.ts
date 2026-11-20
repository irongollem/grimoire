import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { passagesOf, useCanonPassages, useCreateCanonPassage, useDeleteCanonPassage, useUpdateCanonPassage } from "@/composables/canon/useCanonPassages";
import type { CanonLorePassage } from "@/types/canon.types";

/**
 * One entry's passages and what the DM does to the list: add one at the end, move one a place, remove one. Shared by a
 * lore entry and a backstory (whose entry may not exist yet: no passages, nothing to add to), which are both told in passages. Every mutation toasts its own failure, so a refused
 * write is swallowed here and the list stays as it was.
 */
export function usePassageList(entryId: MaybeRefOrGetter<string | null>) {
  const { data: all } = useCanonPassages();
  const passages = computed(() => {
    const id = toValue(entryId);
    return id === null ? [] : passagesOf(all.value ?? [], id);
  });
  const { mutateAsync: createPassage, isPending: adding } = useCreateCanonPassage();
  const { mutateAsync: updatePassage } = useUpdateCanonPassage();
  const { mutateAsync: destroyPassage } = useDeleteCanonPassage();

  async function addPassage() {
    const next = passages.value.reduce((max, p) => Math.max(max, p.sort_order), -1) + 1;
    const id = toValue(entryId);
    if (id === null) return;
    try {
      await createPassage({ entry_id: id, sort_order: next });
    } catch {
      // The mutation has already told the DM (toast).
    }
  }

  /** Moves one passage a place by renumbering the order from its position, so equal or gappy numbers still reorder. */
  async function move(index: number, by: -1 | 1) {
    const order: CanonLorePassage[] = [...passages.value];
    const target = index + by;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    try {
      for (const [i, p] of order.entries()) if (p.sort_order !== i) await updatePassage({ id: p.id, patch: { sort_order: i } });
    } catch {
      // The mutation has already told the DM (toast).
    }
  }

  async function removePassage(p: CanonLorePassage) {
    try {
      await destroyPassage(p.id);
    } catch {
      // The mutation has already told the DM (toast).
    }
  }

  return { passages, adding, addPassage, move, removePassage };
}
