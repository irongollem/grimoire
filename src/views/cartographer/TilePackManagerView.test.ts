import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TilePackManagerView from "./TilePackManagerView.vue";

const isAiEnabled = ref(true);
const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  requireCredits: vi.fn(),
  createRun: vi.fn(),
  runUntilPause: vi.fn(),
  remove: vi.fn(),
  share: vi.fn(),
}));
const packs = ref<Array<Record<string, unknown>>>([]);

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    activeCampaignId: "campaign-1",
    get isAiEnabled() {
      return isAiEnabled.value;
    },
  }),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/composables/billing/useSubscription", () => ({ useSubscription: () => ({ isPro: ref(true) }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 12 }) }));
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ requireCredits: mocks.requireCredits }) }));
const mutation = () => ({ mutateAsync: vi.fn(), isPending: ref(false) });
vi.mock("@/composables/cartographer/useTilePacks", () => ({
  useTilePacks: () => ({
    campaignPacks: packs,
    runs: { data: ref([]) },
    upload: mutation(),
    share: { mutateAsync: mocks.share, isPending: ref(false) },
    remove: { mutateAsync: mocks.remove, isPending: ref(false) },
    createRun: { mutateAsync: mocks.createRun, isPending: ref(false) },
    runUntilPause: mocks.runUntilPause,
    action: mutation(),
    signJobAssets: vi.fn(),
  }),
}));

function mountView() {
  return mount(TilePackManagerView, {
    global: {
      stubs: { PageHeader: { template: "<div><slot /></div>" }, ManualHelpLink: true },
    },
  });
}

describe("TilePackManagerView with AI off", () => {
  beforeEach(() => {
    isAiEnabled.value = true;
  });

  it("offers generation when AI is on", () => {
    expect(mountView().text()).toContain("Generate a complete pack");
  });

  it("hides generation entirely, with no notice, and keeps manual upload", () => {
    isAiEnabled.value = false;
    const text = mountView().text();
    expect(text).not.toContain("Generate a complete pack");
    expect(text).not.toContain("Generation runs");
    expect(text).toContain("Upload a pack");
  });
});

describe("TilePackManagerView paid generation and packs", () => {
  const mine = { id: "p1", name: "Moonlit", user_id: "user-1", pack_version: 1, source: "generated", status: "ready", description: "", campaign_tile_packs: [] };
  const theirs = { ...mine, id: "p2", name: "Borrowed", user_id: "someone-else" };
  const button = (w: ReturnType<typeof mountView>, label: string) => w.findAll("button").find((b) => b.text() === label)!;

  beforeEach(() => {
    isAiEnabled.value = true;
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.requireCredits.mockReturnValue(true);
    mocks.createRun.mockResolvedValue({ run_id: "run-1" });
    mocks.confirm.mockResolvedValue(true);
    packs.value = [mine, theirs];
  });

  it("asks for the three proof assets' credits before starting, and starts nothing when short", async () => {
    mocks.requireCredits.mockReturnValue(false);
    const w = mountView();
    await w.find("input[maxlength='100']").setValue("  Moonlit observatory  ");
    await button(w, "Create generation run").trigger("click");
    expect(mocks.requireCredits).toHaveBeenCalledWith(3 * 12);
    expect(mocks.createRun).not.toHaveBeenCalled();
  });

  it("starts the run with the concept trimmed, for the active campaign, then runs it", async () => {
    const w = mountView();
    await w.find("input[maxlength='100']").setValue("  Moonlit observatory  ");
    await w.find("textarea").setValue("  silver stone  ");
    await button(w, "Create generation run").trigger("click");
    expect(mocks.createRun).toHaveBeenCalledWith({ name: "Moonlit observatory", description: "silver stone", campaignId: "campaign-1" });
    expect(mocks.runUntilPause).toHaveBeenCalledWith("run-1");
  });

  it("will not create a run for an empty concept name", () => {
    const w = mountView();
    expect(button(w, "Create generation run").attributes("disabled")).toBeDefined();
  });

  it("deletes a pack only after the DM confirms, and offers delete and sharing only on their own packs", async () => {
    const w = mountView();
    expect(w.findAll("button").filter((b) => b.text() === "Delete pack")).toHaveLength(1);
    expect(w.text()).toContain("Read only");
    mocks.confirm.mockResolvedValueOnce(false);
    await button(w, "Delete pack").trigger("click");
    await Promise.resolve();
    expect(mocks.remove).not.toHaveBeenCalled();
    await button(w, "Delete pack").trigger("click");
    await Promise.resolve();
    expect(mocks.remove).toHaveBeenCalledWith("p1");
  });

  it("shares a pack with the active campaign from its checkbox", async () => {
    const w = mountView();
    await w.find("input[type='checkbox']").setValue(true);
    expect(mocks.share).toHaveBeenCalledWith({ packId: "p1", campaign: "campaign-1", enabled: true });
  });
});
