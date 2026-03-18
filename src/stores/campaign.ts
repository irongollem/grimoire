import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { Campaign } from "@/types/campaign.types";
import { useTheme } from "@/composables/useTheme";

const STORAGE_KEY = "grimoire_active_campaign";

export const useCampaignStore = defineStore("campaign", () => {
  const activeCampaignId = ref<string | null>(localStorage.getItem(STORAGE_KEY));
  const activeCampaign = ref<Campaign | null>(null);

  watch(activeCampaignId, (id) => {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  });

  function switchToCampaign(campaign: Campaign) {
    activeCampaignId.value = campaign.id;
    activeCampaign.value = campaign;

    // Apply the campaign's chosen theme for all users
    useTheme().setTheme(campaign.theme ?? "grimoire");

    // Sync calendar system and current in-game year from campaign
    import("@/stores/calendar").then(({ useCalendarStore }) => {
      const calendarStore = useCalendarStore();
      calendarStore.loadFromCampaign(campaign.calendar_id, campaign.current_year);
    });
  }

  function clearActiveCampaign() {
    activeCampaignId.value = null;
    activeCampaign.value = null;
  }

  return {
    activeCampaignId,
    activeCampaign,
    switchToCampaign,
    clearActiveCampaign,
  };
});
