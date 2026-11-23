import { computed } from "vue";
import { useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useParty } from "@/composables/party/useParty";

/**
 * The one way a canon secret is revealed to the party (#1255 item 21): stamp `revealed_at` and share it with every
 * party member through `player_visible_to`. The secret's own page and a quest beat tied to it both come here, so the
 * rule is written once. The caller asks first (a confirm, or the beat's own prompt); this only writes.
 */
export function useRevealSecret() {
  const { mutate } = useUpdateCanonEntry();
  const { data: party } = useParty();
  /** False until the party has loaded: revealing to a party that has not loaded would share it with nobody, silently. */
  const ready = computed(() => party.value !== undefined);

  /** Reveals the secret; returns false (and writes nothing) while the party has not loaded. */
  function revealSecret(secretId: string): boolean {
    const members = party.value;
    if (!members) return false;
    mutate({ id: secretId, patch: { revealed_at: new Date().toISOString(), player_visible_to: members.map((m) => m.id) } });
    return true;
  }

  return { ready, revealSecret };
}
