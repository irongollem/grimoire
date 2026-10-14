/**
 * Look after my character (#1059): the hand-over of one character as the
 * signed-in player meets it, and the one thing they can do about it.
 *
 * To its caretaker: "You're looking after Mira for Pia." with Hand back. To its
 * owner: "Tomas is looking after Mira." with Take back. Nothing to anyone else,
 * in DM preview, or on the DM's own view of a sheet (`viewedByDm`): the DM ends
 * hand-overs from the Members tab. The sheet and the Hearth both read this, so
 * the two say the same thing and offer the same button.
 */
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useCharacterCaretakers, useEndHandOver } from "@/composables/party/useCharacterCaretakers";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import { useToast } from "@/composables/useToast";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
import type { PartyMember } from "@/types/party.types";

export interface CaretakingNotice {
  message: string;
  actionLabel: "Hand back" | "Take back";
}

export function useCaretaking(
  member: MaybeRefOrGetter<PartyMember | null | undefined>,
  viewedByDm: MaybeRefOrGetter<boolean> = false,
) {
  const auth = useAuthStore();
  const appUi = useAppUiStore();
  const campaign = useCampaignStore();
  const toast = useToast();
  const { active } = useCharacterCaretakers(() => campaign.activeCampaignId);
  const { data: tableMembers } = useCampaignMembers();
  const { mutateAsync: endHandOverMutation, isPending: ending } = useEndHandOver();

  /** Whether the hand-overs and the open session have both been read. Until
   *  then nothing is known either way, so no control that assumes "not handed
   *  over" may show: offering a hand-over would replace one in force. */
  const loaded = computed(() => active.value !== null);

  const handOver = computed(() => {
    const m = toValue(member);
    return m && active.value ? (active.value.find(row => row.party_member_id === m.id) ?? null) : null;
  });

  const ownedByMe = computed(() => {
    const m = toValue(member);
    return !!m && m.owner_user_id !== null && m.owner_user_id === auth.user?.id;
  });

  const ownView = computed(() => !appUi.dmPreviewMode && !toValue(viewedByDm));

  /** The player is minding this character for its owner: play it, never rebuild it. */
  const isMindingThis = computed(
    () => ownView.value && !!handOver.value && handOver.value.caretaker_user_id === auth.user?.id && !ownedByMe.value,
  );

  const nameOfUser = (userId: string | null): string =>
    tableMembers.value?.find(m => m.user_id === userId)?.display_name ?? "their player";

  const notice = computed<CaretakingNotice | null>(() => {
    const m = toValue(member);
    const h = handOver.value;
    if (!m || !h || !ownView.value) return null;
    if (isMindingThis.value) {
      return { message: `You're looking after ${m.name} for ${nameOfUser(m.owner_user_id)}.`, actionLabel: "Hand back" };
    }
    if (ownedByMe.value) {
      return { message: `${nameOfUser(h.caretaker_user_id)} is looking after ${m.name}.`, actionLabel: "Take back" };
    }
    return null;
  });

  async function end(): Promise<void> {
    const h = handOver.value;
    const m = toValue(member);
    if (!h || !m) return;
    const handingBack = isMindingThis.value;
    try {
      await endHandOverMutation({ id: h.id, campaign_id: h.campaign_id });
      toast.success(handingBack ? `${m.name} went back to ${nameOfUser(m.owner_user_id)}.` : `${m.name} is back with you.`);
    } catch (e) {
      toast.error(toast.fromError(e, handingBack ? `Couldn't hand ${m.name} back.` : `Couldn't take ${m.name} back.`));
    }
  }

  return { loaded, handOver, isMindingThis, notice, end, ending };
}
