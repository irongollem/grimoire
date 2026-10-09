import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import type { Campaign } from "@/types/campaign.types";
import { setTheme } from "@/lib/themeRuntime";
import { useAuthStore } from "@/stores/auth";
import { decryptApiKey } from "@/lib/apiKeyVault";
import { isLocalCiphertext, encryptLocalKey, decryptLocalKey } from "@/lib/localKeyVault";
import { DEFAULT_THEME_ID } from "@/lib/themes";
import { normalizeRuleset, type RulesetKey } from "@/types/ruleset.types";

const STORAGE_KEY      = "grimoire_active_campaign";
const LOCAL_MODE_KEY   = "grimoire_key_local_mode";
const RULESET_HINT_KEY = "grimoire_active_campaign_ruleset";

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

  watch(activeCampaignId, (id) => {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  });

  // The row on screen always belongs to the id on screen. The shell no longer
  // waits for the campaign row (App.vue), so an id can change while the old row
  // is still held — a join link or a mode switch sets the id alone — and
  // without this the previous campaign's name, theme and settings would be
  // shown under the new id until the new row landed. `sync` so no render sees
  // the mismatch; App.vue's hydration watcher then fills the row in.
  watch(
    activeCampaignId,
    (id) => {
      if (activeCampaign.value && activeCampaign.value.id !== id) activeCampaign.value = null;
    },
    { flush: "sync" },
  );

  // The campaign's edition keys a good many library queries (rules, species,
  // monsters, spells, items). The shell mounts before the campaign row arrives,
  // so until it does those queries would key on the 2014 fallback and refetch
  // when the row said 2024. This remembers the last edition seen for the active
  // campaign so a returning visit keys correctly from the first render. It is a
  // hint, never an answer: the row overrides it the moment it exists, and it only
  // applies to the id it was written for.
  function readRulesetHint(id: string | null): string | null {
    if (!id || typeof localStorage === "undefined") return null;
    try {
      const raw = localStorage.getItem(RULESET_HINT_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return null;
      const hint = parsed as { id?: unknown; ruleset?: unknown };
      return hint.id === id && typeof hint.ruleset === "string" ? hint.ruleset : null;
    } catch {
      return null;
    }
  }
  const rulesetHint = ref<string | null>(readRulesetHint(activeCampaignId.value));
  // ID-only switches must drop the previous edition before any query reads it.
  watch(
    activeCampaignId,
    (id) => { rulesetHint.value = readRulesetHint(id); },
    { flush: "sync" },
  );
  watch(
    () => activeCampaign.value && ({ id: activeCampaign.value.id, ruleset: activeCampaign.value.ruleset }),
    (row) => {
      if (!row) return;
      rulesetHint.value = row.ruleset;
      try {
        localStorage.setItem(RULESET_HINT_KEY, JSON.stringify(row));
      } catch {
        // Storage full or blocked: the hint is an optimisation, losing it costs one refetch.
      }
    },
    { immediate: true },
  );

  /** The active campaign's edition: its row once loaded, the remembered hint until then. */
  const activeRuleset = computed<RulesetKey>(() =>
    normalizeRuleset(activeCampaign.value ? activeCampaign.value.ruleset : rulesetHint.value),
  );

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

    setTheme(campaign.theme ?? DEFAULT_THEME_ID);

    loadProviderKeys(campaign);

    // On boot initialize() loaded exactly this campaign's membership a moment
    // ago, so asking again is a third identical read. Only fetch when the
    // loaded row is for a different campaign.
    const auth = useAuthStore();
    if (auth.membership?.campaign_id !== campaign.id) void auth.refreshMembership(campaign.id);

    // Lazy on purpose: the calendar store pulls in the calendar adapters,
    // ~97 kB gzip that the boot budget cannot carry. After a deploy this import
    // can resolve to undefined (see staleChunkRecovery.ts), which
    // isStaleChunkError claims so Sentry does not report it.
    void import("@/stores/calendar").then(({ useCalendarStore }) => {
      useCalendarStore().loadFromCampaign(
        campaign.calendar_id,
        campaign.current_year,
        campaign.current_month,
        campaign.custom_calendar ?? null,
      );
    });
  }

  // The theme belongs to the campaign on screen, and a signed-out visitor has
  // none, so the sign-in forms wear the house theme. The active campaign id and
  // useTheme's stored campaign theme both outlive the session; until this, the
  // login screen came up in whatever campaign was open last, and
  // DEFAULT_THEME_ID only ever reached a browser with nothing stored.
  //
  // Signing back in has to put the campaign's theme back here: `activeCampaign`
  // survives a sign-out in the same tab, so App.vue's hydration finds it already
  // set and does not call `switchToCampaign` again.
  watch(
    () => {
      const auth = useAuthStore();
      return auth.initialized && !auth.isAuthenticated;
    },
    (signedOut) => {
      if (signedOut) setTheme(DEFAULT_THEME_ID);
      else if (activeCampaign.value) setTheme(activeCampaign.value.theme ?? DEFAULT_THEME_ID);
    },
    { immediate: true },
  );

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

  /**
   * `campaignsInTargetLens` is the set of campaign ids the account holds in the
   * `to` role — the caller reads it from `campaign_members` and hands it in,
   * because the store has no way to ask. A remembered id outside that set is
   * dropped rather than restored: the DM slot could be holding a campaign this
   * account only plays in, either written there by the unscoped campaign list
   * this fix replaces, or by an earlier build. Restoring it put the DM shell on
   * someone else's campaign, which is the bug. Omit the set to restore blindly.
   */
  function switchUserMode(
    from: "dm" | "player" | "",
    to: "dm" | "player",
    options: {
      rememberCurrentCampaign?: boolean;
      campaignsInTargetLens?: ReadonlySet<string>;
    } = {},
  ) {
    const { rememberCurrentCampaign = true, campaignsInTargetLens } = options;
    if (from && activeCampaignId.value && rememberCurrentCampaign) {
      localStorage.setItem(MODE_STORAGE_KEY[from], activeCampaignId.value);
    }
    if (from && !rememberCurrentCampaign) {
      localStorage.removeItem(MODE_STORAGE_KEY[from]);
    }
    clearActiveCampaign();
    const remembered = localStorage.getItem(MODE_STORAGE_KEY[to]);
    if (!remembered) return;

    // Fails closed when the lens is unknown, and that is a deliberate reversal
    // (#845). This used to restore blindly on a failed lookup, reasoning that a
    // network blip should not cost the user their remembered campaign. But a
    // lookup that failed is not evidence the campaign is allowed — it is the
    // absence of evidence, and restoring on it reproduces the exact bug this
    // guard exists to stop: a DM slot holding a campaign the account only plays
    // in, putting the DM shell on someone else's game.
    //
    // The asymmetry decides it. Failing closed costs one click to re-pick a
    // campaign, on the rare occasion a request fails. Failing open costs the
    // reported bug, silently, and looks to the user like they have been handed
    // someone else's campaign.
    if (!campaignsInTargetLens || !campaignsInTargetLens.has(remembered)) {
      localStorage.removeItem(MODE_STORAGE_KEY[to]);
      return;
    }
    activeCampaignId.value = remembered;
  }

  // Tri-state: only an explicit `true` counts as on. `null` (never chosen)
  // and `false` (explicitly declined) both hide AI UI — see
  // context/compliance/ai-act.md §4.
  //
  // Also hides AI UI for a child account (#919), even one DMing its own
  // campaign with the toggle on — presentation only, the server is the real
  // boundary (the edge functions' `child_account` gate, `is_user_pro`). This
  // reads `useAuthStore().isChildAccount` rather than the `useQuery`-backed
  // `useChildAccount()` composable: a Pinia setup store's own computed cannot
  // open a TanStack query (no injection context outside a mounted app — every
  // store test in this repo, including this file's own, builds the store
  // without one). `isChildAccount` is a plain ref loaded onto the auth store
  // instead, for exactly this reason.
  const isAiEnabled = computed(
    () => activeCampaign.value?.ai_enabled === true && !useAuthStore().isChildAccount,
  );

  const todayYear  = computed(() => activeCampaign.value?.current_year ?? 1495);
  const todayMonth = computed(() => activeCampaign.value?.current_month ?? 1);
  const todayDay   = computed(() => activeCampaign.value?.current_day ?? 1);

  return {
    activeCampaignId,
    activeCampaign,
    activeRuleset,
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
