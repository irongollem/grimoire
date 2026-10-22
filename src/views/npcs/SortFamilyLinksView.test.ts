import { flushPromises, mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SortFamilyLinksView from "./SortFamilyLinksView.vue";
import { person } from "@/components/kinship/testGraph";
import { buildKinGraph } from "@/lib/kinship/graph";
import { endColumns, linkEnds } from "@/lib/kinship/keys";
import type { KinLink, PersonKey } from "@/types/kinship.types";

const mocks = vi.hoisted(() => ({
  source: null as unknown,
  saved: [] as { id: string; patch: Record<string, unknown> }[],
  failOn: null as string | null,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/composables/kinship/useKinGraph", () => ({ useDmKinGraph: () => mocks.source }));
vi.mock("@/composables/kinship/useKinLinks", () => ({
  useUpdateKinLink: () => ({
    mutateAsync: async (arg: { id: string; patch: Record<string, unknown> }) => {
      if (arg.id === mocks.failOn) throw new Error("boom");
      mocks.saved.push(arg);
      return arg;
    },
  }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: mocks.toastSuccess, error: mocks.toastError, fromError: String }),
}));

const people = [person("a", "Ann", 1400), person("b", "Bo", 1430), person("c", "Cy", 1460)];
const old = (id: string, from: string, to: string): KinLink => ({
  id,
  user_id: "u",
  campaign_id: "c",
  ...endColumns(`npc:${from}` as PersonKey, `npc:${to}` as PersonKey),
  kind: "relative",
  parent_role: null,
  adoptive: false,
  note: "",
  needs_sorting: true,
  created_at: "",
  updated_at: "",
});

const links = ref<KinLink[]>([]);
function setLinks(next: KinLink[]) {
  links.value = next;
}
mocks.source = {
  graph: computed(() =>
    buildKinGraph(people, links.value.map((l) => ({ id: l.id, ...linkEnds(l), kind: l.kind, parent_role: l.parent_role, adoptive: l.adoptive }))),
  ),
  people: computed(() => new Map(people.map((p) => [p.key, p]))),
  links: computed(() => links.value),
  houses: computed(() => []),
  isLoading: computed(() => false),
};

const mountIt = () => mount(SortFamilyLinksView, { global: { stubs: { RouterLink: true } } });
const buttons = (w: ReturnType<typeof mountIt>, text: string) => w.findAll("button").filter((b) => b.text().includes(text));
const saveButton = (w: ReturnType<typeof mountIt>) => w.findAll("button").find((b) => b.text().startsWith("Save "))!;

describe("SortFamilyLinksView", () => {
  beforeEach(() => {
    mocks.saved.length = 0;
    mocks.failOn = null;
    mocks.toastError.mockReset();
    setLinks([old("1", "a", "b"), old("2", "b", "c")]);
  });

  it("drops a saved row's choice at once, so a failure keeps only the unsaved ones", async () => {
    const w = mountIt();
    await buttons(w, "Siblings")[0].trigger("click");
    await buttons(w, "Siblings")[1].trigger("click");
    expect(saveButton(w).text()).toBe("Save 2");
    mocks.failOn = "2";
    await saveButton(w).trigger("click");
    await flushPromises();
    expect(mocks.saved.map((s) => s.id)).toEqual(["1"]);
    expect(mocks.toastError).toHaveBeenCalled();
    expect(saveButton(w).text()).toBe("Save 1");
  });

  it("counts only chosen rows that still exist after a live refetch", async () => {
    const w = mountIt();
    await buttons(w, "Siblings")[0].trigger("click");
    await buttons(w, "Siblings")[1].trigger("click");
    setLinks([old("2", "b", "c")]);
    await flushPromises();
    expect(saveButton(w).text()).toBe("Save 1");
    expect(w.text()).toContain("1 of 1 chosen");
  });

  it("refuses a parent choice that would loop through earlier choices in the run", async () => {
    setLinks([old("1", "a", "b"), old("2", "b", "c"), old("3", "c", "a")]);
    const w = mountIt();
    // Each row's `from` is the parent: Ann of Bo, Bo of Cy, then Cy of Ann closes the loop.
    for (const label of ["Ann is Bo's parent", "Bo is Cy's parent", "Cy is Ann's parent"]) {
      await buttons(w, label)[0].trigger("click");
    }
    await saveButton(w).trigger("click");
    await flushPromises();
    expect(mocks.saved.map((s) => s.id)).toEqual(["1", "2"]);
    expect(w.text()).toContain("That would make someone their own ancestor.");
    expect(saveButton(w).text()).toBe("Save 1");
  });
});
