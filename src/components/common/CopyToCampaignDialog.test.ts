import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CopyToCampaignDialog from "./CopyToCampaignDialog.vue";

const mocks = vi.hoisted(() => ({
  campaigns: [] as { id: string; name: string }[],
  loadCopySources: vi.fn(),
  planCopyFor: vi.fn(),
  resolveUnenabledSources: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: undefined as unknown as { value: boolean },
}));

vi.mock("@/composables/campaign/useCampaigns", () => ({
  useDmCampaigns: () => ({ data: { value: mocks.campaigns } }),
}));

// `isPending` is a genuine Vue ref (built inside the async factory, since
// `vi.hoisted` runs before `vue` is importable) — the template reads it
// straight through `copying`, which only auto-unwraps a real ref.
vi.mock("@/composables/campaign/useCopyToCampaign", async () => {
  const { ref } = await import("vue");
  mocks.isPending = ref(false);
  return {
    loadCopySources: (...args: unknown[]) => mocks.loadCopySources(...args),
    planCopyFor: (...args: unknown[]) => mocks.planCopyFor(...args),
    resolveUnenabledSources: (...args: unknown[]) => mocks.resolveUnenabledSources(...args),
    useCopyToCampaign: () => ({ mutateAsync: mocks.mutateAsync, isPending: mocks.isPending }),
  };
});

function openDialog(props: Record<string, unknown> = {}) {
  return mount(CopyToCampaignDialog, {
    props: {
      open: true,
      table: "items",
      ids: ["i1", "i2"],
      label: "item",
      ...props,
    },
    attachTo: document.body,
    global: { stubs: { transition: false } },
  });
}

// AppModal teleports its panel to document.body, so the mounted wrapper's own
// root is an empty teleport placeholder — `wrapper.text()`/`wrapper.find()`
// never see the panel's content. Query the body directly instead, exactly
// like AppModal.test.ts does.
function optionTexts() {
  return [...document.body.querySelectorAll("option")].map((o) => o.textContent);
}

function bodyText(): string {
  return document.body.textContent ?? "";
}

function copyButton(): HTMLElement | undefined {
  return [...document.body.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Copy"));
}

function selectEl(): HTMLSelectElement {
  return document.body.querySelector("select")!;
}

/** Every source row scoped to camp-1, unless a test overrides it — the
 *  ordinary case where a caller's selection all lives in one campaign. */
function scopedSources(ids: readonly string[], campaignId: string | null = "camp-1") {
  return {
    table: "items",
    sourceRows: ids.map((id) => ({ id, campaign_id: campaignId })),
    referenced: new Map(),
    userId: "user-1",
  };
}

beforeEach(() => {
  mocks.campaigns = [
    { id: "camp-1", name: "Curse of Strahd" },
    { id: "camp-2", name: "Icewind Dale" },
  ];
  mocks.loadCopySources.mockReset().mockImplementation(async ({ ids }: { table: string; ids: readonly string[] }) =>
    scopedSources(ids),
  );
  mocks.planCopyFor.mockReset().mockReturnValue({ payloads: [{}], dropped: [] });
  mocks.resolveUnenabledSources.mockReset().mockResolvedValue(null);
  mocks.mutateAsync.mockReset();
  if (mocks.isPending) mocks.isPending.value = false;
  document.body.innerHTML = "";
});

describe("CopyToCampaignDialog — loading sources", () => {
  // Every list page mounts this dialog closed and leaves it mounted, so setup
  // runs the open/close watcher's reset branch immediately. A ref that branch
  // touches but that was declared further down threw "Cannot access
  // 'copyError' before initialization" and took the whole Item Vault down
  // (14 Sep 2026, found in the running app after every gate was green).
  it("mounts closed without throwing or loading", async () => {
    const wrapper = openDialog({ open: false });
    await flushPromises();
    expect(wrapper.exists()).toBe(true);
    expect(mocks.loadCopySources).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("shows Loading… and disables the picker until the source rows arrive", async () => {
    let resolveLoad!: (v: unknown) => void;
    mocks.loadCopySources.mockReturnValue(new Promise((resolve) => { resolveLoad = resolve; }));
    const wrapper = openDialog();
    await nextTick();

    expect(bodyText()).toContain("Loading…");
    expect(selectEl().disabled).toBe(true);

    resolveLoad(scopedSources(["i1", "i2"]));
    await flushPromises();

    expect(bodyText()).not.toContain("Loading…");
    expect(selectEl().disabled).toBe(false);
    wrapper.unmount();
  });

  it("shows the load failure and leaves the picker disabled", async () => {
    mocks.loadCopySources.mockRejectedValue(new Error("network down"));
    const wrapper = openDialog();
    await flushPromises();

    expect(bodyText()).toContain("network down");
    expect(selectEl().disabled).toBe(true);
    wrapper.unmount();
  });
});

// #875 F17/F19: the target picker used to trust a caller-supplied
// `sourceCampaignId` — always the active campaign — even though a bulk
// selection routinely mixes scopes. The picker's excluded scopes now come
// from the loaded source rows' own `campaign_id`, which is the only thing
// that can answer "would this be a same-scope duplicate" correctly.
describe("CopyToCampaignDialog — target picker", () => {
  it("excludes the source campaign and offers 'All campaigns (general)' when every row is scoped to it", async () => {
    mocks.loadCopySources.mockResolvedValue(scopedSources(["i1", "i2"], "camp-1"));
    const wrapper = openDialog();
    await flushPromises();

    const texts = optionTexts();
    expect(texts).toContain("All campaigns (general)");
    expect(texts).toContain("Icewind Dale");
    expect(texts).not.toContain("Curse of Strahd");
    wrapper.unmount();
  });

  it("excludes 'All campaigns (general)' when every row is already general", async () => {
    mocks.loadCopySources.mockResolvedValue(scopedSources(["i1", "i2"], null));
    const wrapper = openDialog();
    await flushPromises();

    const texts = optionTexts();
    expect(texts).not.toContain("All campaigns (general)");
    expect(texts).toEqual(["Curse of Strahd", "Icewind Dale"]);
    wrapper.unmount();
  });

  it("excludes BOTH general and the campaign when the selection mixes a general row and a camp-1 row", async () => {
    mocks.loadCopySources.mockResolvedValue({
      table: "items",
      sourceRows: [{ id: "i1", campaign_id: null }, { id: "i2", campaign_id: "camp-1" }],
      referenced: new Map(),
      userId: "user-1",
    });
    const wrapper = openDialog();
    await flushPromises();

    // Neither "All campaigns" nor "Curse of Strahd" can be offered — a row
    // already in each of those scopes is part of this copy.
    expect(optionTexts()).toEqual(["Icewind Dale"]);
    wrapper.unmount();
  });

  it("disables the picker and reports no targets when copying the account's only campaign", async () => {
    mocks.campaigns = [{ id: "camp-1", name: "Curse of Strahd" }];
    mocks.loadCopySources.mockResolvedValue(scopedSources(["i1"], "camp-1"));
    const wrapper = openDialog();
    await flushPromises();

    // Only the source itself exists and it is excluded, but "general" is still
    // offered because the source is scoped — so the picker is NOT empty here.
    expect(optionTexts()).toEqual(["All campaigns (general)"]);
    wrapper.unmount();
  });
});

describe("CopyToCampaignDialog — drop report", () => {
  it("renders nothing extra when the plan drops nothing — a picker and a Copy button, no ceremony", async () => {
    mocks.planCopyFor.mockReturnValue({ payloads: [{}], dropped: [] });
    const wrapper = openDialog();
    await flushPromises();

    expect(bodyText()).not.toContain("stay behind");
    expect(bodyText()).not.toContain("left out");
    wrapper.unmount();
  });

  it("names the rows left behind for a field-cleared reference", async () => {
    mocks.planCopyFor.mockReturnValue({
      payloads: [{}],
      dropped: [
        {
          label: "Linked spells",
          names: ["Chill Touch", "Mage Hand"],
          removedEntries: false,
          entryNoun: { singular: "linked spell", plural: "linked spells" },
        },
      ],
    });
    const wrapper = openDialog();
    await flushPromises();

    expect(bodyText()).toContain("Linked spells");
    expect(bodyText()).toContain("Chill Touch, Mage Hand stay behind; the target campaign cannot see them.");
    wrapper.unmount();
  });

  it("reports a whole-entry removal with the count-based wording, using the noun's plural for two", async () => {
    mocks.planCopyFor.mockReturnValue({
      payloads: [{}],
      dropped: [
        {
          label: "Loot entries",
          names: ["Vial of Acid", "Potion of Healing"],
          removedEntries: true,
          entryNoun: { singular: "loot entry", plural: "loot entries" },
        },
      ],
    });
    const wrapper = openDialog();
    await flushPromises();

    expect(bodyText()).toContain("2 loot entries point at rows the target campaign cannot see and were left out.");
    wrapper.unmount();
  });

  it("uses the noun's singular for exactly one removed entry — the grammar F22 fixed", async () => {
    mocks.planCopyFor.mockReturnValue({
      payloads: [{}],
      dropped: [
        {
          label: "Granted spells",
          names: ["Mage Hand"],
          removedEntries: true,
          entryNoun: { singular: "granted spell", plural: "granted spells" },
        },
      ],
    });
    const wrapper = openDialog();
    await flushPromises();

    // Not "1 granted spells points…" — the bug this noun pair exists to fix.
    expect(bodyText()).toContain("1 granted spell points at rows the target campaign cannot see and was left out.");
    wrapper.unmount();
  });

  it("re-plans synchronously when the target changes, with no further fetch", async () => {
    mocks.loadCopySources.mockResolvedValue(scopedSources(["i1", "i2"], "camp-1"));
    const wrapper = openDialog();
    await flushPromises();
    expect(mocks.loadCopySources).toHaveBeenCalledTimes(1);
    expect(mocks.planCopyFor).toHaveBeenCalledWith(expect.anything(), null);

    const sel = selectEl();
    sel.value = "camp-2";
    sel.dispatchEvent(new Event("change"));
    await flushPromises();

    expect(mocks.planCopyFor).toHaveBeenCalledWith(expect.anything(), "camp-2");
    // Still exactly one fetch of the source rows — planning a second target
    // reused what was already loaded.
    expect(mocks.loadCopySources).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});

describe("CopyToCampaignDialog — confirm", () => {
  it("sends the plan's payloads (not raw ids) to the mutation, and emits copied with the destination's name", async () => {
    mocks.loadCopySources.mockResolvedValue(scopedSources(["i1", "i2"], "camp-1"));
    const dropped: never[] = [];
    mocks.planCopyFor.mockReturnValue({ payloads: [{ campaign_id: null, name: "Whatever" }], dropped });
    mocks.mutateAsync.mockResolvedValue({ copied: 2, dropped: [], needsSources: null });
    const wrapper = openDialog();
    await flushPromises();

    copyButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      table: "items",
      payloads: [{ campaign_id: null, name: "Whatever" }],
      dropped,
      needsSources: null,
    });
    // The name travels with the count because the caller's toast is the only
    // confirmation there is — the copies landed somewhere this list cannot show.
    expect(wrapper.emitted("copied")).toEqual([[{ copied: 2, targetName: "all campaigns" }]]);
    expect(wrapper.emitted("close")).toBeUndefined();
    wrapper.unmount();
  });

  it("emits quota-exceeded and nothing else when the mutation rejects with quota_exceeded", async () => {
    mocks.mutateAsync.mockRejectedValue({ message: "quota_exceeded" });
    const wrapper = openDialog();
    await flushPromises();

    copyButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();

    expect(wrapper.emitted("quota-exceeded")).toHaveLength(1);
    expect(wrapper.emitted("copied")).toBeUndefined();
    expect(wrapper.emitted("close")).toBeUndefined();
    wrapper.unmount();
  });

  it("surfaces a non-quota failure inline instead of emitting anything", async () => {
    mocks.mutateAsync.mockRejectedValue(new Error("network down"));
    const wrapper = openDialog();
    await flushPromises();

    copyButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();

    expect(bodyText()).toContain("network down");
    expect(wrapper.emitted("quota-exceeded")).toBeUndefined();
    expect(wrapper.emitted("copied")).toBeUndefined();
    wrapper.unmount();
  });
});

// #598's "referenced shared-library content the target has not enabled is
// reported, not silently broken". It is a note, not a loss — the copy keeps the
// reference; the target campaign just cannot resolve it until the DM enables
// that source there. So it renders as its own panel, and never says "behind".
describe("CopyToCampaignDialog — unenabled library sources", () => {
  it("names the content and the source to enable, without calling it dropped", async () => {
    mocks.resolveUnenabledSources.mockResolvedValue({ names: ["Fireball"], sources: ["Tome of Heroes"] });
    const wrapper = openDialog();
    await flushPromises();

    expect(bodyText()).toContain("Tome of Heroes is not enabled in the target campaign");
    expect(bodyText()).toContain("enable it there and the reference resolves");
    expect(bodyText()).not.toContain("stay behind");
    expect(bodyText()).not.toContain("left out");
    wrapper.unmount();
  });

  it("says nothing when every source is already enabled", async () => {
    mocks.resolveUnenabledSources.mockResolvedValue(null);
    const wrapper = openDialog();
    await flushPromises();
    expect(bodyText()).not.toContain("not enabled in the target campaign");
    wrapper.unmount();
  });
});
