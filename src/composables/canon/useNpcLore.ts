import { computed, ref, toValue, type MaybeRefOrGetter } from "vue";
import { useRouter } from "vue-router";
import { toast } from "@/lib/toast";
import { useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCanonHere } from "@/composables/canon/useCanonHere";
import { useCreateConnection } from "@/composables/connections/useConnections";
import { typeChoices } from "@/lib/worldLinks/connections";

/** A lore entry that is about a person, and how much of it the party has been told. */
export interface NpcLoreRow {
  id: string;
  title: string;
  told: number;
  total: number;
}

/**
 * The lore told about one NPC (#1258 item 26): the lore entries whose `about` link points at them, each with how many
 * of its passages are told (the first counts as told with the entry), and "Write lore about this person", which makes
 * an entry, ties it `about` the person and lands on it in the Canon page. A backstory is not lore, so a character's
 * backstory that is `about` the same person is left out. DM sheets only: the canon reads are the DM's.
 */
export function useNpcLore(npcId: MaybeRefOrGetter<string>, npcName: MaybeRefOrGetter<string>) {
  const router = useRouter();
  // The lore about this person comes with the sheet's own "Canon here" read (`get_canon_here`), so the block costs the
  // sheet no request of its own (the dm-npc-detail budget); it reads no canon or passages of its own.
  const { data: here } = useCanonHere("npc", () => toValue(npcId));
  const { mutateAsync: createEntry } = useCreateCanonEntry();
  const { mutateAsync: connect } = useCreateConnection();
  const writing = ref(false);

  const rows = computed<NpcLoreRow[]>(() => (here.value?.lore ?? []).map((l) => ({ id: l.id, title: l.title, told: l.told, total: l.total })));

  async function writeLore(): Promise<void> {
    if (writing.value) return;
    const about = typeChoices("canon", "npc").find((c) => c.key === "about" && c.subjectIsFrom && c.home === undefined);
    if (!about) throw new Error("A canon entry has no `about` tie to a person");
    writing.value = true;
    try {
      const name = toValue(npcName);
      const entry = await createEntry({ part: "lore", title: `Lore about ${name}` });
      try {
        await connect({ subject: { kind: "canon", id: entry.id }, other: { kind: "npc", id: toValue(npcId), name }, choice: about });
      } catch (e) {
        // The entry exists: land on it anyway, where the Connections section can tie it again.
        toast.error(`The lore was made but not tied to ${name}. ${toast.fromError(e)}`);
      }
      await router.push({ path: "/canon", query: { entry: entry.id } });
    } catch (e) {
      toast.error(toast.fromError(e));
    } finally {
      writing.value = false;
    }
  }

  return { rows, writeLore, writing };
}
