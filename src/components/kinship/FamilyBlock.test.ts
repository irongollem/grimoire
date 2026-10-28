import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FamilyBlock from "./FamilyBlock.vue";
import { edge, k, person, sourceOf } from "./testGraph";
import type { PersonKey } from "@/types/kinship.types";

const mocks = vi.hoisted(() => ({
  dm: null as unknown,
  player: null as unknown,
  deleted: [] as string[],
  updated: [] as { id: string; patch: Record<string, unknown> }[],
  retyped: [] as Record<string, unknown>[],
  confirm: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/composables/kinship/useKinGraph", () => ({
  useDmKinGraph: () => mocks.dm,
  usePlayerKinGraph: () => mocks.player,
}));
vi.mock("@/composables/kinship/useKinLinks", () => ({
  useDeleteKinLink: () => ({ mutateAsync: async (id: string) => void mocks.deleted.push(id) }),
  useUpdateKinLink: () => ({ mutateAsync: async (v: { id: string; patch: Record<string, unknown> }) => void mocks.updated.push(v) }),
}));
vi.mock("@/composables/connections/useConnections", () => ({
  useRetypeConnection: () => ({ mutateAsync: async (v: Record<string, unknown>) => void mocks.retyped.push(v) }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: mocks.toastSuccess, error: mocks.toastError, fromError: (_e: unknown, fallback: string) => fallback }),
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

const mounted: { unmount: () => void }[] = [];

function mountBlock(props: { person: PersonKey; player?: boolean }) {
  const w = mount(FamilyBlock, {
    props,
    attachTo: document.body,
    global: {
      stubs: {
        AddRelativeDialog: { template: "<div data-testid='dialog' />" },
        RouterLink: { props: ["to"], template: "<a :data-to=\"JSON.stringify(to)\"><slot /></a>" },
      },
    },
  });
  mounted.push(w);
  return w;
}

afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
});

beforeEach(() => {
  mocks.dm = sourceOf(people, edges);
  mocks.player = sourceOf(people, edges);
  mocks.deleted.length = 0;
  mocks.updated.length = 0;
  mocks.retyped.length = 0;
  mocks.confirm.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
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

  it("draws each relative as a slip, spaced like the other connection lists", () => {
    const w = mountBlock({ person: k("me") });
    expect(w.findAll("li .torn")).toHaveLength(w.findAll("li").length);
    expect(w.find("ul").classes()).toContain("gap-2");
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

  it("renders nothing at all for a player with no visible kin, even when the DM's graph has family", () => {
    // The DM's source holds Brenna's whole family; the player's source lets nothing through.
    mocks.player = sourceOf([person("me", "Brenna", 1459)], []);
    const empty = mountBlock({ person: k("me"), player: true });
    expect(empty.html()).toBe("<!--v-if-->");
    expect(mountBlock({ person: k("me") }).text()).toContain("Maera");
  });

  it("shows a player only what the player's source lets through, and no editing", () => {
    mocks.player = sourceOf(people.filter((p) => p.name !== "Old Bren"), edges.filter((e) => e.id !== "1" && e.id !== "3"));
    const w = mountBlock({ person: k("me"), player: true });
    expect(w.text()).toContain("Maera");
    expect(w.text()).not.toContain("Old Bren");
    expect(w.text()).not.toContain("Add relative");
    expect(w.find("button[aria-label^='More actions']").exists()).toBe(false);
  });

  it("sends the DM to the family tree and a player to the player's tree", () => {
    expect(mountBlock({ person: k("me") }).get("a[data-to]").attributes("data-to")).toBe(JSON.stringify({ name: "family-tree", params: { key: k("me") } }));
    expect(mountBlock({ person: k("me"), player: true }).get("a[data-to]").attributes("data-to")).toBe(JSON.stringify({ name: "play-family-tree", params: { key: k("me") } }));
  });

  it("confirms a removal in words, names the person and says the link is gone", async () => {
    mocks.confirm.mockResolvedValue(true);
    const w = mountBlock({ person: k("me") });
    const row = w.findAll("li").find((r) => r.text().includes("Maera"))!;
    await row.find("button[aria-label^='More actions']").trigger("click");
    [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes("Remove link"))!.click();
    await flushPromises();
    expect(mocks.confirm.mock.calls[0]![0]).toContain("Maera");
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Link removed.");
  });

  describe("changing a relation in place", () => {
    const rowOf = (w: ReturnType<typeof mountBlock>, name: string) => w.findAll("li").find((r) => r.text().includes(name))!;
    const option = (id: string) => document.body.querySelector<HTMLButtonElement>(`[data-kin-option='${id}']`)!;

    it("makes the word a picker on a stored link and plain text on a derived sibling or a player's row", () => {
      const w = mountBlock({ person: k("me") });
      expect(rowOf(w, "Maera").find("[data-testid='kin-word']").text()).toBe("parent");
      expect(rowOf(w, "Tomas").find("[data-testid='kin-word']").exists()).toBe(false);
      expect(rowOf(w, "Tomas").find("[data-testid='kin-word-static']").text()).toBe("sibling");
      const p = mountBlock({ person: k("me"), player: true });
      expect(p.find("[data-testid='kin-word']").exists()).toBe(false);
    });

    it("updates the row once, in place, and keeps what it still means", async () => {
      const w = mountBlock({ person: k("me") });
      await rowOf(w, "Maera").find("[data-testid='kin-word']").trigger("click");
      option("spouse").click();
      await flushPromises();
      expect(mocks.updated).toHaveLength(1);
      expect(mocks.updated[0].id).toBe("2");
      expect(mocks.updated[0].patch).toMatchObject({ kind: "spouse", parent_role: null, adoptive: false, from_npc_id: "me", to_npc_id: "mum" });
      expect(mocks.deleted).toEqual([]);
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Maera is now Brenna’s spouse.");
    });

    it("does nothing when the current relation is chosen again", async () => {
      const w = mountBlock({ person: k("me") });
      await rowOf(w, "Maera").find("[data-testid='kin-word']").trigger("click");
      option("parent").click();
      await flushPromises();
      expect(mocks.updated).toEqual([]);
    });

    it("speaks the birth-year check inline on a choice it contradicts", async () => {
      const w = mountBlock({ person: k("me") });
      await rowOf(w, "Wren").find("[data-testid='kin-word']").trigger("click");
      const problems = [...document.body.querySelectorAll("[data-testid='kin-problem']")].map((p) => p.textContent);
      // Father, Mother and Parent are the same claim, so each says it.
      expect(problems).toEqual(Array(3).fill("Wren was born 24 years after Brenna."));
    });

    it("moves a kin row to a bond through the retype mutation", async () => {
      const w = mountBlock({ person: k("me") });
      await rowOf(w, "Wren").find("[data-testid='kin-word']").trigger("click");
      const bond = document.body.querySelector<HTMLButtonElement>("[data-bond-option]")!;
      expect(bond).toBeTruthy();
      bond.click();
      await flushPromises();
      expect(mocks.retyped).toHaveLength(1);
      expect(mocks.retyped[0]).toMatchObject({
        connection: { source: "kin", row_id: "4", type: "parent_of", outward: true, other_id: "kid" },
        subject: { kind: "npc", id: "me" },
      });
      expect(mocks.toastSuccess).toHaveBeenCalledWith(expect.stringContaining("Wren is now a bond"));
    });

    it("moves a character's kin row to a bond with the character as the subject", async () => {
      const pcPeople = [person("old", "Old Bren", 1428, { dead: true }), { ...person("me", "Brenna", 1459), key: "pc:me" as PersonKey }];
      mocks.dm = sourceOf(pcPeople, [{ ...edge("1", "old", "me", "parent"), to: "pc:me" as PersonKey }]);
      const w = mountBlock({ person: "pc:me" as PersonKey });
      await rowOf(w, "Old Bren").find("[data-testid='kin-word']").trigger("click");
      document.body.querySelector<HTMLButtonElement>("[data-bond-option]")!.click();
      await flushPromises();
      expect(mocks.retyped[0]).toMatchObject({ subject: { kind: "party_member", id: "me" } });
    });

    it("keeps the link's note when only the kind changes", async () => {
      mocks.dm = (() => {
        const src = sourceOf(people, edges);
        return { ...src, links: { value: src.links.value.map((l) => (l.id === "2" ? { ...l, note: "raised her alone" } : l)) } };
      })();
      const w = mountBlock({ person: k("me") });
      await rowOf(w, "Maera").find("[data-testid='kin-word']").trigger("click");
      option("spouse").click();
      await flushPromises();
      expect(mocks.updated[0]!.patch).toMatchObject({ note: "raised her alone" });
    });

    it("walks the list with the arrows and closes on Escape, handing focus back to the word", async () => {
      const w = mountBlock({ person: k("me") });
      const word = rowOf(w, "Maera").find("[data-testid='kin-word']");
      await word.trigger("click");
      await flushPromises();
      const panel = document.body.querySelector("[data-testid='kin-picker']")!;
      expect(panel.hasAttribute("data-slip")).toBe(true);
      expect(document.activeElement).toBe(option("parent"));
      const press = (key: string) => panel.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      press("ArrowDown");
      expect(document.activeElement).toBe(option("child"));
      press("ArrowUp");
      press("ArrowUp");
      expect(document.activeElement).toBe(option("parent:mother"));
      press("Home");
      expect(document.activeElement).toBe(option("parent:father"));
      press("ArrowUp");
      const last = [...document.body.querySelectorAll("[data-testid='kin-picker'] button")].at(-1);
      expect(document.activeElement).toBe(last);
      press("Escape");
      await flushPromises();
      expect(document.body.querySelector("[data-testid='kin-picker']")).toBeNull();
      expect(document.activeElement).toBe(word.element);
    });
  });
});
