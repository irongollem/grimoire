import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { Campaign } from "@/types/campaign.types";
import { useTheme } from "@/composables/useTheme";
import { decryptApiKey } from "@/lib/apiKeyVault";

const STORAGE_KEY = "grimoire_active_campaign";
const LOCAL_MODE_KEY = "grimoire_openai_key_mode";
const LOCAL_KEY_STORAGE = "grimoire_openai_key";

export const useCampaignStore = defineStore("campaign", () => {
  const activeCampaignId = ref<string | null>(localStorage.getItem(STORAGE_KEY));
  const activeCampaign = ref<Campaign | null>(null);
  const decryptedApiKey = ref<string>("");

  watch(activeCampaignId, (id) => {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  });

  function switchToCampaign(campaign: Campaign) {
    activeCampaignId.value = campaign.id;
    activeCampaign.value = campaign;

    // Apply the campaign's chosen theme for all users
    useTheme().setTheme(campaign.theme ?? "grimoire");

    // Load API key (encrypted from DB or from localStorage if local mode is enabled)
    const localMode = localStorage.getItem(LOCAL_MODE_KEY) === "local";
    if (localMode) {
      // Local mode: key is only in localStorage
      decryptedApiKey.value = localStorage.getItem(LOCAL_KEY_STORAGE) ?? "";
    } else if (campaign.openai_api_key) {
      // DB mode: decrypt the key (or use as-is if legacy plaintext)
      decryptApiKey(campaign.openai_api_key)
        .then((key) => {
          decryptedApiKey.value = key;
        })
        .catch((err) => {
          console.error("Failed to decrypt API key:", err);
          decryptedApiKey.value = "";
        });
    } else {
      decryptedApiKey.value = "";
    }

    // Sync calendar system and current in-game year from campaign
    import("@/stores/calendar").then(({ useCalendarStore }) => {
      const calendarStore = useCalendarStore();
      calendarStore.loadFromCampaign(campaign.calendar_id, campaign.current_year);
    });
  }

  function clearActiveCampaign() {
    activeCampaignId.value = null;
    activeCampaign.value = null;
    decryptedApiKey.value = "";
  }

  return {
    activeCampaignId,
    activeCampaign,
    decryptedApiKey,
    switchToCampaign,
    clearActiveCampaign,
  };
});
