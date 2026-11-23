import { computed } from "vue";
import { useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCampaignSession } from "@/composables/campaign/useCampaignSession";
import { useParty } from "@/composables/party/useParty";

/**
 * The one way a canon secret is revealed (#1255 item 21): stamp `revealed_at` and the session that is running
 * (`revealed_session_id`, null when none runs, as a Found clue does; #1258 item 23), and share it through
 * `player_visible_to` with every party member, or with the ones chosen. The secret's own page and a quest beat tied to
 * it both come here, so the rule is written once. The caller asks first (a confirm, or the beat's own prompt, or the
 * picker's Tell); this only writes.
 */
export function useRevealSecret() {
  const { mutate } = useUpdateCanonEntry();
  const { data: party } = useParty();
  const { session } = useCampaignSession();
  /** False until the party has loaded: revealing to a party that has not loaded would share it with nobody, silently. */
  const ready = computed(() => party.value !== undefined);

  /** Reveals the secret to every member, or only to `memberIds`; returns false (and writes nothing) while the party has not loaded or none is chosen. */
  function revealSecret(secretId: string, memberIds?: readonly string[]): boolean {
    const members = party.value;
    if (!members) return false;
    const audience = memberIds ?? members.map((m) => m.id);
    if (audience.length === 0) return false;
    mutate({
      id: secretId,
      patch: { revealed_at: new Date().toISOString(), revealed_session_id: session.value?.id ?? null, player_visible_to: [...audience] },
    });
    return true;
  }

  return { ready, revealSecret };
}
