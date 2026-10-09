// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// The store reaches for the vault and the theme on hydration; neither is under
// test here and @/lib/supabase throws at module load without env vars.
vi.mock("@/lib/supabase", () => ({ supabase: {}, getCurrentUser: () => null }));
const decryptApiKey = vi.hoisted(() => vi.fn(async (_blob: string) => ""));
vi.mock("@/lib/apiKeyVault", () => ({ decryptApiKey }));
const setTheme = vi.hoisted(() => vi.fn());
vi.mock("@/lib/themeRuntime", () => ({ setTheme }));

// isAiEnabled reads useAuthStore().isChildAccount directly (#919) rather than
// the useQuery-backed useChildAccount() composable, which a Pinia setup
// store's own computed cannot call (no injection context outside a mounted
// app). Mocked wholesale so this file never has to build a real auth store.
interface MockAuthStore {
  isChildAccount: boolean;
  membership?: null;
  refreshMembership?: () => void;
  initialized?: boolean;
  isAuthenticated?: boolean;
}
const mockUseAuthStore = vi.fn((): MockAuthStore => ({ isChildAccount: false }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mockUseAuthStore() }));

import { nextTick, reactive } from "vue";
import { useCampaignStore } from "./campaign";
import { DEFAULT_THEME_ID } from "@/lib/themes";
import type { Campaign } from "@/types/campaign.types";

const DM_SLOT = "grimoire_active_campaign_dm";
const PLAYER_SLOT = "grimoire_active_campaign_player";

describe("switchUserMode — the lens decides which campaign may be restored", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("restores the campaign the target lens remembers", () => {
    localStorage.setItem(DM_SLOT, "my-campaign");
    const store = useCampaignStore();

    store.switchUserMode("player", "dm", {
      campaignsInTargetLens: new Set(["my-campaign"]),
    });

    expect(store.activeCampaignId).toBe("my-campaign");
  });

  it("drops a remembered campaign the target lens does not hold", () => {
    // Exactly the state an earlier build could write: the DM slot pointing at a
    // campaign this account only plays in. Restoring it is how the DM shell came
    // up on somebody else's game.
    localStorage.setItem(DM_SLOT, "someone-elses-campaign");
    const store = useCampaignStore();

    store.switchUserMode("player", "dm", {
      campaignsInTargetLens: new Set(["my-campaign"]),
    });

    expect(store.activeCampaignId).toBeNull();
    expect(localStorage.getItem(DM_SLOT)).toBeNull();
  });

  // Reversed by #845. This used to assert the opposite — that an unknown lens
  // restores blindly so "a failed lookup costs nothing". It does cost
  // something: a lookup that failed says nothing about whether the campaign is
  // allowed, and restoring on it puts the DM shell on a campaign the account
  // may only play in. That is the bug the guard exists to stop, reachable
  // through a network blip. Failing closed costs one click instead.
  it("refuses an unverifiable campaign rather than restoring it unchecked", () => {
    localStorage.setItem(DM_SLOT, "my-campaign");
    const store = useCampaignStore();

    store.switchUserMode("player", "dm", {});

    expect(store.activeCampaignId).toBeNull();
    // And the slot is dropped, so the next switch does not retry a campaign
    // this lens has never been able to confirm.
    expect(localStorage.getItem(DM_SLOT)).toBeNull();
  });

  it("files the outgoing campaign under the mode being left, not the one entered", () => {
    localStorage.setItem("grimoire_active_campaign", "the-game-im-playing");
    const store = useCampaignStore();

    store.switchUserMode("player", "dm", { campaignsInTargetLens: new Set() });

    expect(localStorage.getItem(PLAYER_SLOT)).toBe("the-game-im-playing");
    expect(localStorage.getItem(DM_SLOT)).toBeNull();
    expect(store.activeCampaignId).toBeNull();
  });

  it("forgets the outgoing campaign when the caller asks it to", () => {
    localStorage.setItem("grimoire_active_campaign", "handed-over");
    localStorage.setItem(PLAYER_SLOT, "handed-over");
    const store = useCampaignStore();

    store.switchUserMode("dm", "player", {
      rememberCurrentCampaign: false,
      campaignsInTargetLens: new Set(["handed-over"]),
    });

    // The DM slot is cleared (the campaign is no longer theirs to DM) while the
    // player slot still points at it — this is the ownership-transfer path.
    expect(localStorage.getItem(DM_SLOT)).toBeNull();
    expect(store.activeCampaignId).toBe("handed-over");
  });
});

describe("isAiEnabled — the campaign toggle and the child-account fence (#919)", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    mockUseAuthStore.mockReturnValue({ isChildAccount: false });
  });

  it("is off when the campaign has never turned AI on", () => {
    const store = useCampaignStore();
    store.activeCampaign = { ai_enabled: null } as unknown as Campaign;

    expect(store.isAiEnabled).toBe(false);
  });

  it("is off when the campaign explicitly declined AI", () => {
    const store = useCampaignStore();
    store.activeCampaign = { ai_enabled: false } as unknown as Campaign;

    expect(store.isAiEnabled).toBe(false);
  });

  it("is on when the campaign enabled AI and the account is not a child", () => {
    const store = useCampaignStore();
    store.activeCampaign = { ai_enabled: true } as unknown as Campaign;

    expect(store.isAiEnabled).toBe(true);
  });

  // The gap #919 leaves without this: a child account DMing its own campaign
  // with the toggle on must still not see the ~34 AI generate buttons.
  it("is off for a child account even when the campaign enabled AI", () => {
    mockUseAuthStore.mockReturnValue({ isChildAccount: true });
    const store = useCampaignStore();
    store.activeCampaign = { ai_enabled: true } as unknown as Campaign;

    expect(store.isAiEnabled).toBe(false);
  });
});

describe("switchToCampaign — membership refresh", () => {
  const campaign = { id: "c1", theme: null } as unknown as Campaign;

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  // On boot initialize() has just loaded exactly this campaign's membership.
  it("does not refresh membership already loaded for that campaign", () => {
    const refreshMembership = vi.fn();
    mockUseAuthStore.mockReturnValue({
      isChildAccount: false,
      membership: { campaign_id: "c1" },
      refreshMembership,
    } as never);

    useCampaignStore().switchToCampaign(campaign);

    expect(refreshMembership).not.toHaveBeenCalled();
  });

  it("refreshes membership when it is for another campaign or absent", () => {
    const refreshMembership = vi.fn();
    mockUseAuthStore.mockReturnValue({
      isChildAccount: false,
      membership: { campaign_id: "other" },
      refreshMembership,
    } as never);
    useCampaignStore().switchToCampaign(campaign);
    expect(refreshMembership).toHaveBeenCalledWith("c1");

    refreshMembership.mockClear();
    mockUseAuthStore.mockReturnValue({
      isChildAccount: false,
      membership: null,
      refreshMembership,
    } as never);
    useCampaignStore().switchToCampaign(campaign);
    expect(refreshMembership).toHaveBeenCalledWith("c1");
  });
});

describe("the theme follows the session, not the last campaign", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    setTheme.mockClear();
  });

  // The stored campaign theme outlives the session, so a returning visitor's
  // login screen used to come up in whatever campaign was open last.
  it("puts a signed-out visitor on the house theme", () => {
    mockUseAuthStore.mockReturnValue({ isChildAccount: false, initialized: true, isAuthenticated: false });
    useCampaignStore();

    expect(setTheme).toHaveBeenCalledExactlyOnceWith(DEFAULT_THEME_ID);
  });

  // Before auth has finished checking, "no user" means "not known yet". Acting
  // on it would flash the house theme over a signed-in DM's campaign on boot.
  it("leaves the restored theme alone until auth has finished checking", () => {
    mockUseAuthStore.mockReturnValue({ isChildAccount: false, initialized: false, isAuthenticated: false });
    useCampaignStore();

    expect(setTheme).not.toHaveBeenCalled();
  });

  it("leaves a signed-in account's theme to its campaign", () => {
    mockUseAuthStore.mockReturnValue({ isChildAccount: false, initialized: true, isAuthenticated: true });
    useCampaignStore();

    expect(setTheme).not.toHaveBeenCalled();
  });

  // The store keeps `activeCampaign` across a sign-out in the same tab, so
  // hydration never calls `switchToCampaign` again and nothing else would
  // take the house theme back off.
  it("restores the campaign's theme when the same tab signs back in", async () => {
    const auth = reactive<MockAuthStore>({ isChildAccount: false, initialized: true, isAuthenticated: true });
    mockUseAuthStore.mockReturnValue(auth);
    const store = useCampaignStore();
    store.activeCampaign = { theme: "grimoire" } as unknown as Campaign;

    auth.isAuthenticated = false;
    await nextTick();
    expect(setTheme).toHaveBeenLastCalledWith(DEFAULT_THEME_ID);

    auth.isAuthenticated = true;
    await nextTick();
    expect(setTheme).toHaveBeenLastCalledWith("grimoire");
  });
});

// The shell mounts before the campaign row arrives (#999), which makes two
// things the store's job: never show one campaign's row under another's id, and
// key edition-scoped queries correctly before the row lands.
describe("the campaign row and its id", () => {
  const HINT = "grimoire_active_campaign_ruleset";
  const row = (id: string, ruleset: "2014" | "2024") => ({ id, ruleset, theme: null }) as unknown as Campaign;

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    mockUseAuthStore.mockReturnValue({ isChildAccount: false, membership: null, refreshMembership: vi.fn() } as MockAuthStore);
  });

  it("drops the held row as soon as the id moves to another campaign", () => {
    const store = useCampaignStore();
    store.switchToCampaign(row("a", "2014"));
    store.activeCampaignId = "b";
    expect(store.activeCampaign).toBeNull();
  });

  it("keeps the row when the id is set to the one it already belongs to", () => {
    const store = useCampaignStore();
    store.switchToCampaign(row("a", "2014"));
    store.activeCampaignId = "a";
    expect(store.activeCampaign?.id).toBe("a");
  });

  it("answers 2014 for a campaign it has never seen, until the row says otherwise", () => {
    localStorage.setItem("grimoire_active_campaign", "a");
    const store = useCampaignStore();
    expect(store.activeRuleset).toBe("2014");
    store.switchToCampaign(row("a", "2024"));
    expect(store.activeRuleset).toBe("2024");
  });

  it("remembers the edition per campaign and uses it before the row arrives", async () => {
    const first = useCampaignStore();
    first.switchToCampaign(row("a", "2024"));
    await nextTick();
    expect(JSON.parse(localStorage.getItem(HINT) ?? "null")).toEqual({ id: "a", ruleset: "2024" });

    setActivePinia(createPinia());
    const reloaded = useCampaignStore();
    expect(reloaded.activeCampaign).toBeNull();
    expect(reloaded.activeRuleset).toBe("2024");
  });

  it("ignores a remembered edition that belongs to a different campaign", () => {
    localStorage.setItem(HINT, JSON.stringify({ id: "other", ruleset: "2024" }));
    localStorage.setItem("grimoire_active_campaign", "a");
    expect(useCampaignStore().activeRuleset).toBe("2014");
  });

  it("drops the previous edition immediately when only the campaign id changes", async () => {
    const store = useCampaignStore();
    store.switchToCampaign(row("a", "2024"));
    await nextTick();
    expect(store.activeRuleset).toBe("2024");

    store.activeCampaignId = "b";

    expect(store.activeCampaign).toBeNull();
    expect(store.activeRuleset).toBe("2014");
  });

  it("reads the target campaign's hint immediately when only the id changes", () => {
    localStorage.setItem("grimoire_active_campaign", "a");
    localStorage.setItem(HINT, JSON.stringify({ id: "b", ruleset: "2024" }));
    const store = useCampaignStore();
    expect(store.activeRuleset).toBe("2014");

    store.activeCampaignId = "b";

    expect(store.activeCampaign).toBeNull();
    expect(store.activeRuleset).toBe("2024");
  });

  it("survives a corrupt remembered edition", () => {
    localStorage.setItem(HINT, "{nope");
    localStorage.setItem("grimoire_active_campaign", "a");
    expect(useCampaignStore().activeRuleset).toBe("2014");
  });
});

describe("provider keys — a decryption lands only in the load that started it", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    decryptApiKey.mockReset();
  });

  function campaignWith(id: string, openai: string | null): Campaign {
    return { id, theme: null, openai_api_key: openai, anthropic_api_key: null, gemini_api_key: null } as unknown as Campaign;
  }

  it("does not write campaign A's key into B when A's decryption answers late", async () => {
    let answerA: (key: string) => void = () => {};
    decryptApiKey.mockImplementationOnce(() => new Promise<string>((resolve) => { answerA = resolve; }));
    const store = useCampaignStore();

    store.switchToCampaign(campaignWith("a", "enc:v1:a"));
    expect(store.providerKeysLoading).toBe(true);
    store.switchToCampaign(campaignWith("b", null));
    expect(store.providerKeysLoading).toBe(false);

    answerA("sk-a");
    await new Promise((r) => setTimeout(r, 0));
    expect(store.decryptedOpenAiKey).toBe("");
  });

  it("gives up on a decryption that never answers, rather than blocking prices for the session", async () => {
    vi.useFakeTimers();
    try {
      decryptApiKey.mockImplementationOnce(() => new Promise<string>(() => {}));
      const store = useCampaignStore();
      store.switchToCampaign(campaignWith("a", "enc:v1:a"));
      expect(store.providerKeysLoading).toBe(true);
      await vi.advanceTimersByTimeAsync(15_000);
      expect(store.providerKeysLoading).toBe(false);
      expect(store.decryptedOpenAiKey).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });
});
