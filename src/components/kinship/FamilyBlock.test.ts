import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FamilyBlock from "./FamilyBlock.vue";
import { edge, k, person, sourceOf } from "./testGraph";
import type { PersonKey } from "@/types/kinship.types";

const mocks = vi.hoisted(() => ({
  dm: null as unknown,
  player: null as unknown,
  deleted: [] as string[],
  confirm: vi.fn(),
}));

vi.mock("@/composables/kinship/useKinGraph", () => ({
  useDmKinGraph: () => mocks.dm,
  usePlayerKinGraph: () => mocks.player,
}));
vi.mock("@/composables/kinship/useKinLinks", () => ({
  useDeleteKinLink: () => ({ mutateAsync: async (id: string) => void mocks.deleted.push(id) }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ todayYear: 1495, isAiEnabled: false }) }));
vi.mock("@/composables/kinship/useKinClock", async () => {
  const { computed } = await import("vue");
  const { testClock } = await import("./testGraph");
  return { useKinClock: () => computed(() => testClock()) };
});

const people = [
  person("old", "Old Bren", 1428, { dead: true }),
  person("mum", "Maera", 1431),
  person("me", "Brenna", 1459),
  person("bro", "Tomas", 1462),
  person("kid", "Wren", 1483),
];
const edges = [
  edge("1", "old", "me", "parent"),
  edge("2", "mum", "me", "parent"),
  edge("3", "old", "bro", "parent"),
  edge("4", "me", "kid", "parent"),
];

function mountBlock(props: { person: PersonKey; player?: boolean }) {
  return mount(FamilyBlock, {
    props,
    attachTo: document.body,
    global: {
      stubs: {
        AddRelativeDialog: { template: "<div data-testid='dialog' />" },
        RouterLink: { template: "<a><slot /></a>" },
      },
    },
  });
}

beforeEach(() => {
  mocks.dm = sourceOf(people, edges);
  mocks.player = sourceOf(people, edges);
  mocks.deleted.length = 0;
  mocks.confirm.mockReset();
  document.body.innerHTML = "";
});

describe("FamilyBlock", () => {
  it("lists the groups in order with the derived-sibling caption", () => {
    const w = mountBlock({ person: k("me") });
    const titles = w.findAll("h3").map((h) => h.text());
    expect(titles).toEqual(["Parents", "Siblings", "Children"]);
    expect(w.text()).toContain("from shared parents");
    expect(w.text()).toContain("Old Bren");
    expect(w.text()).toContain("Add relative");
    expect(w.text()).toContain("Open tree");
  });

  it("offers Remove link on a stored link but no menu on a derived sibling", () => {
    const w = mountBlock({ person: k("me") });
    const rows = w.findAll("li");
    const byName = (n: string) => rows.find((r) => r.text().includes(n))!;
    expect(byName("Maera").find("button[aria-label^='More actions']").exists()).toBe(true);
    expect(byName("Tomas").find("button[aria-label^='More actions']").exists()).toBe(false);
  });

  it("removes a link after confirmation only", async () => {
    mocks.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const w = mountBlock({ person: k("me") });
    const row = w.findAll("li").find((r) => r.text().includes("Maera"))!;
    await row.find("button[aria-label^='More actions']").trigger("click");
    const remove = () => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes("Remove link"))!;
    remove().click();
    await flushPromises();
    expect(mocks.deleted).toEqual([]);
    await row.find("button[aria-label^='More actions']").trigger("click");
    remove().click();
    await flushPromises();
    expect(mocks.deleted).toEqual(["2"]);
  });

  it("shows a quiet line and Add relative to the DM when there is no family", () => {
    mocks.dm = sourceOf([person("solo", "Solo", null)], []);
    const empty = mountBlock({ person: k("solo") });
    expect(empty.text()).toContain("No family yet.");
    expect(empty.text()).toContain("Add relative");
    expect(empty.text()).not.toContain("Open tree");
  });

  it("renders nothing at all for a player with no visible kin, and no editing for one who has some", () => {
    mocks.player = sourceOf([person("solo", "Solo", null)], []);
    const empty = mountBlock({ person: k("solo"), player: true });
    expect(empty.html()).toBe("<!--v-if-->");

    mocks.player = sourceOf(people, edges);
    const w = mountBlock({ person: k("me"), player: true });
    expect(w.text()).toContain("Parents");
    expect(w.text()).not.toContain("Add relative");
    expect(w.find("button[aria-label^='More actions']").exists()).toBe(false);
  });
});
