import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import type { Campaign } from "@/types/campaign.types";
import { setPlayerSeat, setTheme } from "@/lib/themeRuntime";
import { useAuthStore } from "@/stores/auth";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { DEFAULT_THEME_ID } from "@/lib/themes";
import { DEFAULT_RULESET, type RulesetKey } from "@/types/ruleset.types";
import { DEFAULT_GAME_SYSTEM, gameSystemEdition, isGameSystemKey, setActiveGameSystem, type GameSystemKey } from "@/systems/registry";

const STORAGE_KEY      = "grimoire_active_campaign";
const GAME_SYSTEM_HINT_KEY = "grimoire_active_campaign_game_system";
const RETIRED_KEY_STORAGE = [
  "grimoire_openai_key",
  "grimoire_anthropic_key",
  "grimoire_gemini_key",
  "grimoire_key_local_mode",
  "grimoire_falai_key",
];


// Every AI request runs on the server now (#1260). A device that once kept its
// own keys (the removed local mode) still holds them, plus an IndexedDB vault of
// the encryption key, and nothing reads them any more: purge, best effort. A
// device that never used local mode holds none of them, and is left alone.
function sweepRetiredKeyStorage() {
  const storage = safeLocalStorage();
  const held = RETIRED_KEY_STORAGE.filter((key) => storage.getItem(key) !== null);
  if (held.length === 0) return;
  for (const key of held) storage.removeItem(key);
  try {
    indexedDB.deleteDatabase("grimoire-keyvault");
  } catch {
    // Firefox throws on reading `indexedDB` when site data is blocked.
  }
}
sweepRetiredKeyStorage();

export const useCampaignStore = defineStore("campaign", () => {
  const activeCampaignId = ref<string | null>(
    safeLocalStorage().getItem(STORAGE_KEY),
  );
  const activeCampaign   = ref<Campaign | null>(null);

  watch(activeCampaignId, (id) => {
    if (id) safeLocalStorage().setItem(STORAGE_KEY, id);
    else safeLocalStorage().removeItem(STORAGE_KEY);
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

  // The campaign's game system keys a good many library queries (rules,
  // species, monsters, spells, items) and decides which surfaces exist. The
  // shell mounts before the campaign row arrives, so until it does those would
  // key on the fallback and refetch when the row said otherwise. This remembers
  // the last system seen for the active campaign so a returning visit keys
  // correctly from the first render. It is a hint, never an answer: the row
  // overrides it the moment it exists, and it only applies to the id it was
  // written for. An unreadable hint is the fallback, as before.
  function readGameSystemHint(id: string | null): GameSystemKey | null {
    if (!id) return null;
    try {
      const raw = safeLocalStorage().getItem(GAME_SYSTEM_HINT_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return null;
      const hint = parsed as { id?: unknown; game_system?: unknown };
      return hint.id === id && isGameSystemKey(hint.game_system) ? hint.game_system : null;
    } catch {
      return null;
    }
  }
  const gameSystemHint = ref<GameSystemKey | null>(readGameSystemHint(activeCampaignId.value));
  // ID-only switches must drop the previous system before any query reads it.
  watch(
    activeCampaignId,
    (id) => { gameSystemHint.value = readGameSystemHint(id); },
    { flush: "sync" },
  );
  watch(
    () => activeCampaign.value && ({ id: activeCampaign.value.id, game_system: activeCampaign.value.game_system }),
    (row) => {
      if (!row) return;
      gameSystemHint.value = row.game_system;
      try {
        safeLocalStorage().setItem(GAME_SYSTEM_HINT_KEY, JSON.stringify(row));
      } catch {
        // Storage full or blocked: the hint is an optimisation, losing it costs one refetch.
      }
    },
    { immediate: true },
  );

  /** The active campaign's game system: its row once loaded, the remembered hint until then. */
  const activeGameSystem = computed<GameSystemKey>(() => {
    const fromRow = activeCampaign.value?.game_system;
    if (isGameSystemKey(fromRow)) return fromRow;
    return gameSystemHint.value ?? DEFAULT_GAME_SYSTEM;
  });
  // The registry's non-reactive readers (the dice roller, the roll-mode
  // directive) follow the store through this.
  watch(activeGameSystem, (system) => setActiveGameSystem(system), { immediate: true });

  /**
   * The 5e edition of the active campaign's system. Read only by surfaces that
   * exist in a 5e campaign (sheets, stat blocks, the codex, the bestiary, the
   * vault), which a Generic campaign hides (`systemOffers`), so it never has to
   * answer for a system with no edition. It still returns a RulesetKey, the
   * default edition, for Generic, because ~99 `useRuleset()` callers and every
   * library query key need a key and a throw here would crash a surface that
   * merely mounted before the gate hid it. Anything that must know whether the
   * campaign HAS an edition asks `gameSystemEdition(activeGameSystem)`.
   */
  const activeRuleset = computed<RulesetKey>(() => gameSystemEdition(activeGameSystem.value) ?? DEFAULT_RULESET);

  function switchToCampaign(campaign: Campaign) {
    activeCampaignId.value = campaign.id;
    activeCampaign.value   = campaign;

    setTheme(campaign.theme ?? DEFAULT_THEME_ID);

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

  // A player's own theme applies at a table they play at, never one they run.
  watch(() => useAuthStore().isPlayer, (isPlayer) => setPlayerSeat(isPlayer), { immediate: true });

  function clearActiveCampaign() {
    activeCampaignId.value      = null;
    activeCampaign.value        = null;
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
      safeLocalStorage().setItem(MODE_STORAGE_KEY[from], activeCampaignId.value);
    }
    if (from && !rememberCurrentCampaign) {
      safeLocalStorage().removeItem(MODE_STORAGE_KEY[from]);
    }
    clearActiveCampaign();
    const remembered = safeLocalStorage().getItem(MODE_STORAGE_KEY[to]);
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
      safeLocalStorage().removeItem(MODE_STORAGE_KEY[to]);
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

  // A campaign can seat more than one DM (#590): its owner, and any co-DM the
  // owner hands the chair to. Both are `role = 'dm'` and RLS gives both the
  // campaign; ownership is `campaigns.user_id` alone. This decides only which
  // owner-only controls render (who sits in the DM chair, the danger zone, the
  // transfer panel); the server refuses the rest whatever the UI shows.
  const isOwner = computed(() => {
    const campaign = activeCampaign.value;
    const userId = useAuthStore().user?.id;
    return campaign !== null && userId !== undefined && campaign.user_id === userId;
  });

  const todayYear  = computed(() => activeCampaign.value?.current_year ?? 1);
  const todayMonth = computed(() => activeCampaign.value?.current_month ?? 1);
  const todayDay   = computed(() => activeCampaign.value?.current_day ?? 1);

  return {
    activeCampaignId,
    activeCampaign,
    activeGameSystem,
    activeRuleset,
    isAiEnabled,
    isOwner,
    switchToCampaign,
    clearActiveCampaign,
    switchUserMode,
    todayYear,
    todayMonth,
    todayDay,
  };
});
