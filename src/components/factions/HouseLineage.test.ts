import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import HouseLineage from "./HouseLineage.vue";
import { key, makeSource } from "@/components/kinship/testGraph";
import type { Faction } from "@/types/faction.types";

const mocks = vi.hoisted(() => ({
  route: { query: {} as Record<string, string> },
  replace: vi.fn(),
  push: vi.fn(),
  setLine: vi.fn(),
  npcs: [] as unknown[],
  pcs: [] as unknown[],
  toastSuccess: vi.fn(),
}));

vi.mock("vue-router", async (orig) => ({
  ...(await orig<typeof import("vue-router")>()),
  useRoute: () => reactive(mocks.route),
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}));
vi.mock("@/composables/useBreakpoint", () => ({ useIsMobile: () => ref(false), useIsTouch: () => ref(false) }));
vi.mock("@/composables/kinship/useKinGraph", () => ({ useDmKinGraph: () => makeSource() }));
vi.mock("@/composables/factions/useFactions", () => ({
  useFactionNpcs: () => ({ data: ref(mocks.npcs), isLoading: ref(false) }),
  useFactionPartyMembers: () => ({ data: ref(mocks.pcs), isLoading: ref(false) }),
  useUpdateFaction: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/factions/useHouseSuccession", () => ({
  useSetHouseSuccession: () => ({ mutateAsync: mocks.setLine }),
}));
vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: mocks.toastSuccess, error: vi.fn(), fromError: String }),
}));

const house = (descent: Faction["descent"] = "either"): Faction =>
  ({ id: "h1", name: "House Thane", faction_type: "House", descent, succession_note: "", emblem_url: null }) as Faction;

const npc = (id: string, status = "Active", rank: number | null = null, role: string | null = null) => ({
  npc_id: id, status, role, succession_rank: rank, npc: { name: id },
});

function mountIt(f = house()) {
  return mount(HouseLineage, { props: { faction: f }, global: { stubs: { RouterLink: RouterLinkStub } } });
}
const names = (w: ReturnType<typeof mountIt>) => w.findAll(".kin-name").map((n) => n.text());
const card = (w: ReturnType<typeof mountIt>, name: string) =>
  w.findAllComponents({ name: "KinCard" }).find((c) => c.text().includes(name));

describe("HouseLineage", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.route.query = {};
    mocks.replace.mockReset();
    mocks.push.mockReset();
    mocks.setLine.mockReset().mockResolvedValue(undefined);
    mocks.npcs = [npc("aldous", "Active", null, "Head of house"), npc("bren"), npc("brenna", "Active", 1), npc("tomas", "Active", 2)];
    mocks.pcs = [];
  });

  it("says so when the house has no members", () => {
    mocks.npcs = [];
    expect(mountIt().text()).toContain("No members yet.");
  });

  it("names the head and draws the family", () => {
    const w = mountIt();
    expect(w.text()).toContain("head: aldous");
    expect(names(w)).toContain("Brenna");
  });

  it("seeds leave out the expelled and defected", () => {
    mocks.npcs = [npc("brenna"), npc("tomas", "Expelled"), npc("pip", "Defected")];
    const n = names(mountIt(house("oath")));
    expect(n).toContain("Brenna");
    expect(n).not.toContain("Tomas");
    expect(n).not.toContain("Pip");
  });

  it("opens the person instead of re-centring", async () => {
    await card(mountIt(), "Brenna")?.trigger("click");
    expect(mocks.push).toHaveBeenCalledWith("/npcs/brenna");
  });

  it("shows the stored line as numbers, and Centred on with a clear button", async () => {
    mocks.route.query = { focus: key("tomas") };
    const w = mountIt();
    expect(w.text()).toContain("Centred on Tomas");
    expect(card(w, "Brenna")?.text()).toContain("1");
    await w.find('button[aria-label="Show the whole house"]').trigger("click");
    expect(mocks.replace).toHaveBeenCalledWith({ query: {} });
  });

  it("sets the line by clicking and writes the ordered keys on Done", async () => {
    const w = mountIt();
    await w.findAll("button").find((b) => b.text() === "Line of succession")?.trigger("click");
    expect(w.text()).toContain("Setting the line of succession");
    // Starts from the stored line (brenna, tomas); take brenna out, add bren.
    await card(w, "Brenna")?.trigger("click");
    await card(w, "Bren")?.trigger("click");
    await w.findAll("button").find((b) => b.text() === "Done")?.trigger("click");
    await flushPromises();
    expect(mocks.setLine).toHaveBeenCalledWith({ factionId: "h1", line: [key("tomas"), key("bren")] });
    expect(mocks.toastSuccess).toHaveBeenCalled();
    expect(w.text()).not.toContain("Setting the line of succession");
  });

  it("Cancel leaves the mode without writing", async () => {
    const w = mountIt();
    await w.findAll("button").find((b) => b.text() === "Line of succession")?.trigger("click");
    await w.findAll("button").find((b) => b.text() === "Cancel")?.trigger("click");
    expect(mocks.setLine).not.toHaveBeenCalled();
    expect(w.text()).toContain("Line of succession");
  });
});
