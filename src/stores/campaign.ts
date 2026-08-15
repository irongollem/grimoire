import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import type { Campaign } from "@/types/campaign.types";
import { useTheme } from "@/composables/useTheme";
import { decryptApiKey } from "@/lib/apiKeyVault";
import { isLocalCiphertext, encryptLocalKey, decryptLocalKey } from "@/lib/localKeyVault";

const STORAGE_KEY      = "grimoire_active_campaign";
const LOCAL_MODE_KEY   = "grimoire_key_local_mode";

// Per-provider localStorage keys (local mode only)
const LOCAL_KEYS: Record<string, string> = {
  openai:    "grimoire_openai_key",
  anthropic: "grimoire_anthropic_key",
  gemini:    "grimoire_gemini_key",
};

// DB field name → provider slug
const DB_KEY_FIELDS: Record<string, keyof Campaign> = {
  openai:    "openai_api_key",
  anthropic: "anthropic_api_key",
  gemini:    "gemini_api_key",
};

// #641 dropped fal.ai. A BYOK-local user can still be holding its key on this
// device, and nothing reads that entry any more — so purge it rather than leave
// a live credential on disk for a provider we no longer talk to. Server-stored
// keys went with the falai_api_key column (20260809145858).
if (typeof localStorage !== "undefined") localStorage.removeItem("grimoire_falai_key");

export const useCampaignStore = defineStore("campaign", () => {
  const activeCampaignId = ref<string | null>(
    typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
  );
  const activeCampaign   = ref<Campaign | null>(null);

  // Decrypted keys per provider
  const decryptedOpenAiKey    = ref<string>("");
  const decryptedAnthropicKey = ref<string>("");
  const decryptedGeminiKey    = ref<string>("");

  const providerKeyRefs: Record<string, ReturnType<typeof ref<string>>> = {
    openai:    decryptedOpenAiKey,
    anthropic: decryptedAnthropicKey,
    gemini:    decryptedGeminiKey,
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

  // Resolve a BYOK-local key into its plaintext (in-memory) form, decrypting
  // the local-vault ciphertext. Legacy values — pre-vault plaintext, or a
  // server `enc:v1:` blob left over from a cloud→local switch — are surfaced
  // immediately and then re-encrypted into the local vault so at-rest storage
  // is always ciphertext going forward.
  function loadLocalKey(localKey: string, ref_: ReturnType<typeof ref<string>>) {
    const stored = localStorage.getItem(localKey) ?? "";
    if (!stored) { ref_.value = ""; return; }

    if (isLocalCiphertext(stored)) {
      decryptLocalKey(stored)
        .then((key) => { ref_.value = key; })
        .catch(() => { ref_.value = ""; });
      return;
    }

    const migrate = (plaintext: string) => {
      ref_.value = plaintext;
      if (!plaintext) return;
      encryptLocalKey(plaintext)
        .then((enc) => { if (enc) localStorage.setItem(localKey, enc); })
        .catch(() => { /* keep plaintext fallback; retried next load */ });
    };

    if (stored.startsWith("enc:v1:")) {
      // Server-encrypted blob wrongly left in localStorage — decrypt via the
      // server vault once, then hand it to the local vault.
      decryptApiKey(stored)
        .then((key) => migrate(key))
        .catch(() => { ref_.value = ""; });
    } else {
      migrate(stored);
    }
  }

  function loadProviderKeys(campaign: Campaign) {
    const localMode = localStorage.getItem(LOCAL_MODE_KEY) === "local";
    for (const [provider, localKey] of Object.entries(LOCAL_KEYS)) {
      const ref_ = providerKeyRefs[provider];
      if (!ref_) continue;
      if (localMode) {
        loadLocalKey(localKey, ref_);
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
      calendarStore.loadFromCampaign(
        campaign.calendar_id,
        campaign.current_year,
        campaign.current_month,
        campaign.custom_calendar ?? null,
      );
    });
  }

  function clearActiveCampaign() {
    activeCampaignId.value      = null;
    activeCampaign.value        = null;
    decryptedOpenAiKey.value    = "";
    decryptedAnthropicKey.value = "";
    decryptedGeminiKey.value    = "";
  }

  // Mode switch (#729): each mode remembers its own last-active campaign, so
  // toggling DM → Player → DM lands back where the DM left off. STORAGE_KEY
  // stays the boot key (whatever was active last, regardless of mode); these
  // two are only read here. Restoring sets the id and lets App.vue's
  // earlyCampaign watcher hydrate the full row — same path as a cold boot.
  const MODE_STORAGE_KEY: Record<"dm" | "player", string> = {
    dm:     "grimoire_active_campaign_dm",
    player: "grimoire_active_campaign_player",
  };

  function switchUserMode(
    from: "dm" | "player" | "",
    to: "dm" | "player",
    rememberCurrentCampaign = true,
  ) {
    if (from && activeCampaignId.value && rememberCurrentCampaign) {
      localStorage.setItem(MODE_STORAGE_KEY[from], activeCampaignId.value);
    }
    if (from && !rememberCurrentCampaign) {
      localStorage.removeItem(MODE_STORAGE_KEY[from]);
    }
    clearActiveCampaign();
    const remembered = localStorage.getItem(MODE_STORAGE_KEY[to]);
    if (remembered) activeCampaignId.value = remembered;
  }

  // Tri-state: only an explicit `true` counts as on. `null` (never chosen)
  // and `false` (explicitly declined) both hide AI UI — see
  // context/compliance/ai-act.md §4.
  const isAiEnabled = computed(() => activeCampaign.value?.ai_enabled === true);

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
    switchToCampaign,
    clearActiveCampaign,
    switchUserMode,
    todayYear,
    todayMonth,
    todayDay,
  };
});
