import { useRouter } from "vue-router";
import { toast } from "@/lib/toast";
import { useCreateConnectionInCampaign } from "@/composables/connections/useConnections";
import { useCreateNpcInCampaign } from "@/composables/npcs/useNpcs";
import { useCampaignStore } from "@/stores/campaign";
import { typeChoices, type TypeChoice } from "@/lib/worldLinks/connections";
import { ref } from "vue";

/**
 * New NPC from this backstory (#1226 story 10, frame 14): the person a character's past brings in, made already tied to
 * the backstory (`about`) and hidden from every player until the DM shares them, then opened for the DM to fill in.
 * The tie has its own reveal, so the player can know a person and not another's name.
 */
export function useNewBackstoryNpc() {
  const router = useRouter();
  const { mutateAsync: createNpc } = useCreateNpcInCampaign();
  const { mutateAsync: connect } = useCreateConnectionInCampaign();
  const campaign = useCampaignStore();
  const creating = ref(false);
  let pendingNpc: { id: string; name: string; campaignId: string } | null = null;
  let completedConnections = new Set<string>();

  function discardPending(): void {
    pendingNpc = null;
    completedConnections = new Set();
  }

  async function start(entryId: string, characterName: string, characterId: string, personTie: TypeChoice): Promise<void> {
    if (creating.value) return;
    const campaignId = campaign.activeCampaignId;
    if (!campaignId) return;
    if (pendingNpc && pendingNpc.campaignId !== campaignId) {
      toast.error("Switch back to the campaign where this NPC was started, then retry the connection.");
      return;
    }
    const about = typeChoices("canon", "npc").find((c) => c.key === "about" && c.subjectIsFrom && c.home === undefined);
    if (!about) throw new Error("A canon entry has no `about` tie to a person");
    creating.value = true;
    try {
      const createdNpc = pendingNpc ?? await createNpc({
        name: `Someone from ${characterName}'s past`,
        campaign_id: campaignId,
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
      const npc = { ...createdNpc, campaignId };
      pendingNpc = npc;
      if (!completedConnections.has("canon")) {
        await connect({ input: { subject: { kind: "canon", id: entryId }, other: { kind: "npc", id: npc.id, name: npc.name }, choice: about }, campaignId });
        completedConnections.add("canon");
      }
      if (!completedConnections.has("person")) {
        await connect({ input: { subject: { kind: "npc", id: npc.id }, other: { kind: "party_member", id: characterId, name: characterName }, choice: personTie }, campaignId });
        completedConnections.add("person");
      }
      if (campaign.activeCampaignId === campaignId) await router.push({ name: "npc-detail", params: { id: npc.id } });
      else toast.info("NPC created in the campaign where you started. Switch back to open it.");
      pendingNpc = null;
      completedConnections = new Set();
    } catch (e) {
      toast.error(toast.fromError(e));
    } finally {
      creating.value = false;
    }
  }

  return { start, creating, discardPending };
}
