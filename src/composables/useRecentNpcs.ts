import { ref, readonly, watch } from "vue";
import { useCampaignStore } from "@/stores/campaign";

const CAP = 10;

function storageKey(campaignId: string | null): string {
  return `grimoire_recent_npcs_${campaignId ?? "default"}`;
}

function readStorage(campaignId: string | null): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(campaignId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

// Module-level singleton — all components share one reactive list
const _ids = ref<string[]>([]);
let _loadedForCampaign: string | null | undefined = undefined;

function reload(campaignId: string | null) {
  _loadedForCampaign = campaignId;
  _ids.value = readStorage(campaignId);
}

export function useRecentNpcs() {
  const campaignStore = useCampaignStore();

  if (_loadedForCampaign !== campaignStore.activeCampaignId) {
    reload(campaignStore.activeCampaignId);
  }

  watch(() => campaignStore.activeCampaignId, (id) => reload(id));

  function recordVisit(npcId: string) {
    const ids = _ids.value.filter((i) => i !== npcId);
    ids.unshift(npcId);
    _ids.value = ids.slice(0, CAP);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(storageKey(campaignStore.activeCampaignId), JSON.stringify(_ids.value));
    }
  }

  return { recordVisit, recentIds: readonly(_ids) };
}
