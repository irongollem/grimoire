/**
 * Look after my character (#1059): the one place a client asks "what name does
 * a line I send for this character carry", and who is minding whom.
 */
import { computed } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
import { useCharacterCaretakers } from "@/composables/party/useCharacterCaretakers";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import { minderTagOfName, speakerFor, type Speaker } from "@/lib/player/speaker";

interface SpeakerCharacter {
  id: string;
  name: string;
}

/** `enabled` lets permanently-mounted callers defer the reads until a speaker is needed. */
export function useSpeaker(enabled?: () => boolean) {
  const auth = useAuthStore();
  const campaign = useCampaignStore();
  const caretakers = useCharacterCaretakers(() => ((enabled?.() ?? true) ? campaign.activeCampaignId : null));
  const { data: members } = useCampaignMembers(enabled);

  const myName = computed(() => {
    const own = members.value?.find(m => m.user_id === auth.user?.id)?.display_name;
    return own || auth.publicName || "Unknown";
  });

  /** The speaker for a line sent for `character`. */
  function speaker(character: SpeakerCharacter): Speaker {
    const active = caretakers.active.value;
    // Before the hand-overs load, a line is the character's own, as it was before #1059.
    if (!active) return { name: character.name, forPartyMemberId: null };
    return speakerFor(character, active, auth.user?.id ?? null, myName.value);
  }

  /** The name a line for `character` carries. */
  function speakerName(character: SpeakerCharacter): string {
    return speaker(character).name;
  }

  /** The character a ready-made speaker name speaks for, or null. */
  function forPartyMemberIdOfName(senderName: string, characters: readonly SpeakerCharacter[]): string | null {
    const active = caretakers.active.value;
    if (!active) return null;
    return minderTagOfName(senderName, active, auth.user?.id ?? null, myName.value, characters);
  }

  /** Who is minding a character now, by the caretaker's campaign name. */
  function caretakerNameOf(partyMemberId: string): string | null {
    const handOver = caretakers.active.value?.find(row => row.party_member_id === partyMemberId);
    if (!handOver) return null;
    return members.value?.find(m => m.user_id === handOver.caretaker_user_id)?.display_name || "another player";
  }

  return { speaker, speakerName, forPartyMemberIdOfName, caretakerNameOf, myName, handOvers: caretakers.active };
}

/**
 * The speaker for a surface that only ever names a line after the member's own
 * seat (a cast, a check). Only a seated member outside DM preview can be
 * minding a character, so the DM's screens read no hand-overs for it.
 */
export function useSeatedSpeaker() {
  const auth = useAuthStore();
  const appUi = useAppUiStore();
  return useSpeaker(() => !appUi.dmPreviewMode && auth.linkedPartyMemberId != null);
}
