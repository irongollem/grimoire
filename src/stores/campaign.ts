import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import type { Campaign } from "@/types/campaign.types";
import { useTheme } from "@/composables/useTheme";
import { decryptApiKey } from "@/lib/apiKeyVault";

const STORAGE_KEY      = "grimoire_active_campaign";
const LOCAL_MODE_KEY   = "grimoire_key_local_mode";

// Per-provider localStorage keys (local mode only)
const LOCAL_KEYS: Record<string, string> = {
  openai:    "grimoire_openai_key",
  anthropic: "grimoire_anthropic_key",
  gemini:    "grimoire_gemini_key",
  falai:     "grimoire_falai_key",
};

// DB field name → provider slug
const DB_KEY_FIELDS: Record<string, keyof Campaign> = {
  openai:    "openai_api_key",
  anthropic: "anthropic_api_key",
  gemini:    "gemini_api_key",
  falai:     "falai_api_key",
};

export const useCampaignStore = defineStore("campaign", () => {
  const activeCampaignId = ref<string | null>(
    typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
  );
  const activeCampaign   = ref<Campaign | null>(null);

  // Decrypted keys per provider
  const decryptedOpenAiKey    = ref<string>("");
  const decryptedAnthropicKey = ref<string>("");
  const decryptedGeminiKey    = ref<string>("");
  const decryptedFalAiKey     = ref<string>("");

  const providerKeyRefs: Record<string, ReturnType<typeof ref<string>>> = {
    openai:    decryptedOpenAiKey,
    anthropic: decryptedAnthropicKey,
    gemini:    decryptedGeminiKey,
    falai:     decryptedFalAiKey,
  };

  // Backward-compat computed used by generator panels to gate the AI button
  const decryptedApiKey = computed<string>(() => {
    const provider = activeCampaign.value?.text_provider ?? "openai";
    return providerKeyRefs[provider]?.value ?? decryptedOpenAiKey.value;
  });

  watch(activeCampaignId, (id) => {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  });

  function loadProviderKeys(campaign: Campaign) {
    const localMode = localStorage.getItem(LOCAL_MODE_KEY) === "local";
    for (const [provider, localKey] of Object.entries(LOCAL_KEYS)) {
      const ref_ = providerKeyRefs[provider];
      if (!ref_) continue;
      if (localMode) {
        ref_.value = localStorage.getItem(localKey) ?? "";
      } else {
        const dbField = DB_KEY_FIELDS[provider];
        const encrypted = campaign[dbField] as string | null | undefined;
        if (encrypted) {
          decryptApiKey(encrypted)
            .then((key) => { ref_.value = key; })
            .catch(() => { ref_.value = ""; });
        } else {
          ref_.value = "";
        }
      }
    }
  }

  function switchToCampaign(campaign: Campaign) {
    activeCampaignId.value = campaign.id;
    activeCampaign.value   = campaign;

    useTheme().setTheme(campaign.theme ?? "grimoire");

    loadProviderKeys(campaign);

    import("@/stores/auth").then(({ useAuthStore }) => {
      useAuthStore().refreshMembership(campaign.id);
    });

    import("@/stores/calendar").then(({ useCalendarStore }) => {
      const calendarStore = useCalendarStore();
      calendarStore.loadFromCampaign(campaign.calendar_id, campaign.current_year);
    });
  }

  function clearActiveCampaign() {
    activeCampaignId.value      = null;
    activeCampaign.value        = null;
    decryptedOpenAiKey.value    = "";
    decryptedAnthropicKey.value = "";
    decryptedGeminiKey.value    = "";
    decryptedFalAiKey.value     = "";
  }

  const isAiEnabled = computed(() => activeCampaign.value?.ai_enabled !== false);

  const todayYear  = computed(() => activeCampaign.value?.current_year ?? 1495);
  const todayMonth = computed(() => activeCampaign.value?.current_month ?? 1);
  const todayDay   = computed(() => activeCampaign.value?.current_day ?? 1);

  return {
    activeCampaignId,
    activeCampaign,
    decryptedApiKey,
    isAiEnabled,
    decryptedOpenAiKey,
    decryptedAnthropicKey,
    decryptedGeminiKey,
    decryptedFalAiKey,
    switchToCampaign,
    clearActiveCampaign,
    todayYear,
    todayMonth,
    todayDay,
  };
});
