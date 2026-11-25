import { toast } from "@/lib/toast";
import { useCreateConnectionInCampaign } from "@/composables/connections/useConnections";
import { useCreateNpcInCampaign } from "@/composables/npcs/useNpcs";
import { useCampaignStore } from "@/stores/campaign";
import { typeChoices, type TypeChoice } from "@/lib/worldLinks/connections";
import { ref } from "vue";

/** The tie a made person gets when the DM names none. */
const DEFAULT_TIE = "contact";

/** What the DM types to make a person from a backstory: a name, and optionally how they relate to the character. */
export interface NewBackstoryPerson {
  name: string;
  /** The tie to the character (the same typed choice as on the character's page); "contact of" when the DM left it. */
  relationship: TypeChoice | null;
}

/**
 * New NPC from this backstory (#1226 story 10, frame 14; #1258 item 25; #1279 item 12): the person a character's past
 * brings in, made from a name the DM types and hidden from every player until the DM shares them. The character is the
 * one subject of a backstory's ties, so the only tie written is the character's own (the same tie the character's page
 * shows); nothing is written from the backstory entry. The relationship is optional and reads as "contact of" when the DM
 * leaves it, so the person is never made with no tie to the character. It does not navigate: the DM stays on the
 * backstory, and the person it made is returned so the caller can offer "Open sheet". The tie has its own reveal, so the
 * player can know a person and not another's name.
 */
export function useNewBackstoryNpc() {
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

  async function start(characterName: string, characterId: string, person: NewBackstoryPerson): Promise<{ id: string; name: string } | null> {
    const name = person.name.trim();
    if (creating.value || name === "") return null;
    const campaignId = campaign.activeCampaignId;
    if (!campaignId) return null;
    if (pendingNpc && pendingNpc.campaignId !== campaignId) {
      toast.error("Switch back to the campaign where this NPC was started, then retry the connection.");
      return null;
    }
    const tie = person.relationship ?? typeChoices("npc", "party_member").find((c) => c.key === DEFAULT_TIE);
    if (!tie) throw new Error("A person has no default tie to a character");
    creating.value = true;
    try {
      const createdNpc = pendingNpc ?? await createNpc({
        name,
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
      if (!completedConnections.has("person")) {
        await connect({ input: { subject: { kind: "npc", id: npc.id }, other: { kind: "party_member", id: characterId, name: characterName }, choice: tie }, campaignId });
        completedConnections.add("person");
      }
      pendingNpc = null;
      completedConnections = new Set();
      if (campaign.activeCampaignId !== campaignId) {
        toast.info("NPC created in the campaign where you started. Switch back to see them.");
        return null;
      }
      return { id: npc.id, name: npc.name };
    } catch (e) {
      toast.error(toast.fromError(e));
      return null;
    } finally {
      creating.value = false;
    }
  }

  return { start, creating, discardPending };
}
