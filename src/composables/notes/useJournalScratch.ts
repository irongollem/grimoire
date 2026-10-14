import { computed, ref, watch } from "vue";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { isBlankNote } from "./useMyEntityNote";

/**
 * The Hearth's scratch pad: an unsent draft of a journal entry. It lives in this
 * browser only (per user and per campaign) until it is added to the journal, so
 * it survives a reload or a trip to another page but is not a record anywhere.
 */
const PREFIX = "grimoire:journal-scratch";

/** The storage key for one player's pad in one campaign. */
export function scratchKey(userId: string, campaignId: string): string {
  return `${PREFIX}:${userId}:${campaignId}`;
}

/** The saved pad, or an empty string when nothing (usable) is stored. */
export function readScratch(storage: Storage, key: string): string {
  try {
    const stored = storage.getItem(key);
    return stored !== null && !isBlankNote(stored) ? stored : "";
  } catch {
    return "";
  }
}

/** Store the pad; a blank pad removes the key rather than keeping an empty document. */
export function writeScratch(storage: Storage, key: string, content: string): void {
  try {
    if (isBlankNote(content)) storage.removeItem(key);
    else storage.setItem(key, content);
  } catch {
    // Storage full or refused: the pad still works for this visit.
  }
}

export function useJournalScratch() {
  const auth = useAuthStore();
  const campaign = useCampaignStore();

  const key = computed(() => {
    const userId = auth.user?.id;
    const campaignId = campaign.activeCampaignId;
    return userId && campaignId ? scratchKey(userId, campaignId) : null;
  });

  const content = ref("");
  watch(
    key,
    (next) => {
      content.value = next ? readScratch(safeLocalStorage(), next) : "";
    },
    { immediate: true },
  );

  watch(content, (value) => {
    if (key.value) writeScratch(safeLocalStorage(), key.value, value);
  });

  const isBlank = computed(() => isBlankNote(content.value));

  function clear() {
    content.value = "";
    if (key.value) writeScratch(safeLocalStorage(), key.value, "");
  }

  return { content, isBlank, clear };
}
