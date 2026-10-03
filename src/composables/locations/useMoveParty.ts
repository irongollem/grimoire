import { useSetCampaignLocation } from "@/composables/campaign/useCampaigns";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { useCampaignStore } from "@/stores/campaign";

export interface MovePartyRequest {
  roomId: string;
  /** Named in the confirmation when the move crosses no open way. */
  roomName: string;
  currentRoomId: string | null;
  /** `siteReachability`'s answer; `null` makes no claim, so nothing is asked. */
  reachable: ReadonlySet<string> | null;
}

/**
 * Moving the party to a room of a site being run: the one write the run
 * surfaces make (`campaigns.current_location_id`), shared by the room list
 * (`SiteRoomList`) and the plan (`SiteRunSurface`, `QuestSiteHandoff`).
 *
 * Reachability does not gate the move. The door graph is the DM's own prep
 * and is often unfinished or simply wrong for what happened at the table (a
 * misclick, a teleport, a wall that came down), so a room it leaves out is a
 * question, not a refusal. Until 2 Oct 2026 the list and the plan each
 * refused such a room and opened its Atlas page instead, which left a DM who
 * clicked the wrong room first with no way to put the party anywhere else.
 *
 * Resolves true once the party has moved.
 */
export function useMoveParty() {
  const campaign = useCampaignStore();
  const toast = useToast();
  const { confirm } = useConfirm();
  const { mutateAsync: setCampaignLocation, isPending: isMoving } = useSetCampaignLocation();

  async function moveParty({ roomId, roomName, currentRoomId, reachable }: MovePartyRequest): Promise<boolean> {
    const campaignId = campaign.activeCampaignId;
    if (!campaignId || isMoving.value || roomId === currentRoomId) return false;
    if (reachable && !reachable.has(roomId)) {
      const proceed = await confirm(
        `No open way leads to ${roomName} from where the party is. Move them there anyway?`,
        { title: "Not reachable from here", confirmLabel: "Move the party", danger: false },
      );
      if (!proceed) return false;
    }
    try {
      await setCampaignLocation({ id: campaignId, locationId: roomId });
      return true;
    } catch (e) {
      toast.error(toast.fromError(e));
      return false;
    }
  }

  return { moveParty, isMoving };
}
