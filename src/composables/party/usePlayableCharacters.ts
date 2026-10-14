/**
 * Look after my character (#1059): the characters the signed-in player can
 * switch between at this table, and the switch itself.
 *
 * Minding is a seat. Everything keys on `campaign_members.party_member_id`, so
 * switching is the existing seat change (`useSetActiveCharacter`); the server
 * admits a minded character while its hand-over is in force and moves the seat
 * back when it ends. A player minding nothing has nothing to switch to, and the
 * DM's preview never shows the switcher.
 */
import { computed, ref } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useAppUiStore } from "@/stores/ui/app";
import { useCampaignStore } from "@/stores/campaign";
import { useParty, useSetActiveCharacter } from "@/composables/party/useParty";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import { useCharacterCaretakers } from "@/composables/party/useCharacterCaretakers";
import { useCampaignMemorials } from "@/composables/memorials/useMemorials";
import { activeMembers } from "@/composables/party/useActiveParty";
import { useToast } from "@/composables/useToast";
import { mindedBy } from "@/lib/player/caretaking";
import { pickHome, type PlayableCharacter } from "@/lib/player/playableCharacters";

export type { PlayableCharacter };

export function usePlayableCharacters() {
  const auth = useAuthStore();
  const appUi = useAppUiStore();
  const campaign = useCampaignStore();
  const toast = useToast();

  const { data: party } = useParty();
  const { data: tableMembers } = useCampaignMembers();
  const { data: memorials } = useCampaignMemorials();
  const { rows, openSessionId } = useCharacterCaretakers(() => campaign.activeCampaignId);
  const { mutateAsync: setActive } = useSetActiveCharacter();

  const activeId = computed(() => auth.linkedPartyMemberId);

  const myHandOvers = computed(() => {
    const me = auth.user?.id;
    // Nothing to switch to until the hand-overs have loaded.
    if (!me || !rows.value) return [];
    return mindedBy(rows.value, me, openSessionId.value);
  });

  const ownerName = (ownerUserId: string | null): string | null =>
    ownerUserId === null
      ? null
      : tableMembers.value?.find(m => m.user_id === ownerUserId)?.display_name ?? null;

  const characters = computed<PlayableCharacter[]>(() => {
    const me = auth.user?.id;
    const roster = party.value;
    if (appUi.dmPreviewMode || !me || !roster) return [];

    const mineAll = roster.filter(
      m => m.owner_user_id === me || (m.owner_user_id === null && m.id === activeId.value),
    );
    const mine = memorials.value ? activeMembers(mineAll, memorials.value) : mineAll;
    const home = pickHome(mine, activeId.value, myHandOvers.value.map(h => h.return_member_id));

    const result: PlayableCharacter[] = [];
    if (home) result.push({ member: home, kind: "own", ownerName: null });
    for (const handOver of myHandOvers.value) {
      const minded = roster.find(m => m.id === handOver.party_member_id);
      if (!minded || minded.owner_user_id === me) continue;
      result.push({ member: minded, kind: "minding", ownerName: ownerName(minded.owner_user_id) });
    }
    return result;
  });

  const isMinding = computed(() =>
    characters.value.some(c => c.kind === "minding" && c.member.id === activeId.value),
  );
  const hasMinded = computed(() => characters.value.some(c => c.kind === "minding"));

  const switchingId = ref<string | null>(null);
  const switching = computed(() => switchingId.value !== null);

  async function switchTo(id: string): Promise<void> {
    if (id === activeId.value || switching.value || appUi.dmPreviewMode) return;
    switchingId.value = id;
    try {
      await setActive(id);
    } catch (e) {
      toast.error(toast.fromError(e, "Couldn't switch characters."));
    } finally {
      switchingId.value = null;
    }
  }

  return { characters, activeId, isMinding, hasMinded, switchTo, switching, switchingId };
}
