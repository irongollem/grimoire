import { computed, ref } from "vue";
import { useCanonEntries, useCreateCanonEntry, useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useLinkBecame } from "@/composables/canon/useLinkBecame";
import { toast } from "@/lib/toast";
import type { CanonEntry } from "@/types/canon.types";

/**
 * "Give it clues" on a truth known to no one (#1279 item 14): it makes the secret that holds the clues, with the truth's
 * title and arc, points that secret at the truth (`became_entry_id`) and writes the `led_to` link from secret to truth,
 * the same pair of writes a revealed secret made into a truth leaves (`useLinkBecame`). The secret is not revealed:
 * finding its clues is the DM's to run. A secret that already became the truth is returned instead of a second made.
 */
export function useGiveClues(truth: () => CanonEntry) {
  const { data: entries } = useCanonEntries();
  const { mutateAsync: create } = useCreateCanonEntry();
  const { mutateAsync: update } = useUpdateCanonEntry();
  const linkBecame = useLinkBecame();

  /** The secret that already became this truth, if one exists. */
  const secretOfTruth = computed(() => (entries.value ?? []).find((e) => e.part === "secret" && e.became_entry_id === truth().id));

  /** True while the secret is being made, so a second tap before the first lands makes no second secret. */
  const making = ref(false);

  /** Makes the secret and returns it, or null when a write was refused or one is already being made (the DM has been told). */
  async function giveClues(): Promise<CanonEntry | null> {
    const t = truth();
    const existing = secretOfTruth.value;
    if (existing !== undefined) return existing;
    if (making.value) return null;
    making.value = true;
    try {
      return await makeSecret(t);
    } finally {
      making.value = false;
    }
  }

  async function makeSecret(t: CanonEntry): Promise<CanonEntry | null> {
    let secret: CanonEntry;
    try {
      secret = await create({ part: "secret", title: t.title, arc_id: t.arc_id });
    } catch {
      return null; // The mutation has already told the DM (toast).
    }
    try {
      await update({ id: secret.id, patch: { became_entry_id: t.id } });
    } catch {
      toast.error("The secret was made, but it could not be pointed at this truth.");
      return secret;
    }
    await linkBecame(secret, t);
    return secret;
  }

  return { secretOfTruth, giveClues, making };
}
