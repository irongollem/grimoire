import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { Campaign } from "@/types/campaign.types";
import { useTheme } from "@/composables/useTheme";
import { decryptApiKey } from "@/lib/apiKeyVault";

const STORAGE_KEY = "grimoire_active_campaign";
const LOCAL_MODE_KEY = "grimoire_openai_key_mode";
const LOCAL_KEY_STORAGE = "grimoire_openai_key";
const TEXT_LOCAL_MODE_KEY = "grimoire_text_key_mode";
const TEXT_LOCAL_KEY_STORAGE = "grimoire_text_key";

export const useCampaignStore = defineStore("campaign", () => {
  const activeCampaignId = ref<string | null>(localStorage.getItem(STORAGE_KEY));
  const activeCampaign = ref<Campaign | null>(null);
  const decryptedApiKey = ref<string>("");
  const decryptedTextApiKey = ref<string>("");

  watch(activeCampaignId, (id) => {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  });

  function switchToCampaign(campaign: Campaign) {
    activeCampaignId.value = campaign.id;
    activeCampaign.value = campaign;

    // Apply the campaign's chosen theme for all users
    useTheme().setTheme(campaign.theme ?? "grimoire");

    // Load image API key (openai_api_key)
    const localMode = localStorage.getItem(LOCAL_MODE_KEY) === "local";
    if (localMode) {
      decryptedApiKey.value = localStorage.getItem(LOCAL_KEY_STORAGE) ?? "";
    } else if (campaign.openai_api_key) {
      decryptApiKey(campaign.openai_api_key)
        .then((key) => { decryptedApiKey.value = key; })
        .catch(() => { decryptedApiKey.value = ""; });
    } else {
      decryptedApiKey.value = "";
    }

    // Load text API key (text_api_key)
    const textLocalMode = localStorage.getItem(TEXT_LOCAL_MODE_KEY) === "local";
    if (textLocalMode) {
      decryptedTextApiKey.value = localStorage.getItem(TEXT_LOCAL_KEY_STORAGE) ?? "";
    } else if (campaign.text_api_key) {
      decryptApiKey(campaign.text_api_key)
        .then((key) => { decryptedTextApiKey.value = key; })
        .catch(() => { decryptedTextApiKey.value = ""; });
    } else {
      decryptedTextApiKey.value = "";
    }

    // Reload the user's membership for the new campaign so role-based guards
    // (isDM / isPlayer) reflect the active campaign, not a stale earlier one.
    import("@/stores/auth").then(({ useAuthStore }) => {
      useAuthStore().refreshMembership(campaign.id);
    });

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
    decryptedTextApiKey.value = "";
  }

  return {
    activeCampaignId,
    activeCampaign,
    decryptedApiKey,
    decryptedTextApiKey,
    switchToCampaign,
    clearActiveCampaign,
  };
});
