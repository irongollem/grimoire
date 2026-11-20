import { useRouter } from "vue-router";
import { toast } from "@/lib/toast";
import { useCreateConnection } from "@/composables/connections/useConnections";
import { useCreateNpc } from "@/composables/npcs/useNpcs";
import { typeChoices } from "@/lib/worldLinks/connections";

/**
 * New NPC from this backstory (#1226 story 10, frame 14): the person a character's past brings in, made already tied to
 * the backstory (`about`) and hidden from every player until the DM shares them, then opened for the DM to fill in.
 * The tie has its own reveal, so the player can know a person and not another's name.
 */
export function useNewBackstoryNpc() {
  const router = useRouter();
  const { mutateAsync: createNpc, isPending: creating } = useCreateNpc();
  const { mutateAsync: connect } = useCreateConnection();

  async function start(entryId: string, characterName: string): Promise<void> {
    const about = typeChoices("canon", "npc").find((c) => c.key === "about" && c.subjectIsFrom && c.home === undefined);
    if (!about) throw new Error("A canon entry has no `about` tie to a person");
    try {
      const npc = await createNpc({
        name: `Someone from ${characterName}'s past`,
        race: null,
        alignment: null,
        age: null,
        occupation: null,
        appearance: null,
        personality: null,
        voice: null,
        backstory: null,
        notes: null,
        status: "alive",
        relationship: "unknown",
        portrait_url: null,
        cutout_url: null,
        disguise_name: null,
        disguise_portrait_url: null,
        is_revealed: true,
        tags: [],
        stat_block: null,
        scriptorium_doc_id: null,
        // Hidden until the DM shares them: no player is on the list, and no field is shown.
        player_visible_to: [],
        player_visible_fields: [],
      });
      await connect({ subject: { kind: "canon", id: entryId }, other: { kind: "npc", id: npc.id, name: npc.name }, choice: about });
      await router.push({ name: "npc-detail", params: { id: npc.id } });
    } catch (e) {
      toast.error(toast.fromError(e));
    }
  }

  return { start, creating };
}
