import { computed } from "vue";
import { useCanonClues } from "@/composables/canon/useCanonClues";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useCanonForceData } from "@/composables/canon/useCanonForces";
import { useCanonPassages } from "@/composables/canon/useCanonPassages";
import { canonThisSession, type SessionCanon } from "@/lib/canon/canonSession";
import type { CampaignSession } from "@/types/session.types";

/**
 * "Canon this session" for the Chronicle (#1258 item 8): a function that says what the canon did in a given session.
 * Every read is one the Canon page already makes, so it shares their cache and the campaign doorbell refreshes it.
 */
export function useSessionCanon() {
  const entries = useCanonEntries();
  const clues = useCanonClues();
  const passages = useCanonPassages();
  const forceData = useCanonForceData();
  return computed(() => {
    const input = {
      entries: entries.data.value ?? [],
      clues: clues.data.value ?? [],
      passages: passages.data.value ?? [],
      steps: forceData.data.value?.steps ?? [],
      ticks: forceData.data.value?.ticks ?? [],
    };
    return (session: Pick<CampaignSession, "id" | "started_at" | "played_on" | "created_at">): SessionCanon => canonThisSession({ session, ...input });
  });
}
