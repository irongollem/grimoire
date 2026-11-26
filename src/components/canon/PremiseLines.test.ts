import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { canonEntry } from "@/test/canonEntry";
import type { CanonEntry } from "@/types/canon.types";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm-1" }) }));

import { useCanonUiStore } from "@/stores/ui/canon";
import PremiseLines from "./PremiseLines.vue";
import { useCampaignStore } from "@/stores/campaign";

function mountLines() {
  const pinia = createPinia();
  setActivePinia(pinia);
  useCampaignStore().activeCampaignId = "c1";
  return mount(PremiseLines, {
    props: { title: "Themes", itemLabel: "Theme", placeholder: "…", kinds: ["theme"], entries: [] },
    global: { plugins: [pinia, VueQueryPlugin], stubs: { PremiseLineRow: true } },
  });
}
const boxValue = (w: ReturnType<typeof mountLines>) => (w.find("input").element as HTMLInputElement).value;

describe("PremiseLines add row", () => {
  beforeEach(() => fake.reset());

  it("creates nothing for a blank draft", async () => {
    const w = mountLines();
    await w.find("input").setValue("   ");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(fake.rows("canon_entries")).toEqual([]);
  });

  it("creates the theme as a premise entry of its kind and clears the box on success", async () => {
    const w = mountLines();
    await w.find("input").setValue(" Kindness is courage. ");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(fake.rows("canon_entries")).toMatchObject([{ part: "premise", premise_kind: "theme", title: "Kindness is courage." }]);
    expect(boxValue(w)).toBe("");
  });

  // Bug caught (#1279 item 5): the arc filter leaking into a premise row, which has no arc (the table refuses it).
  it("never writes an arc on a premise entry, whatever arc the page is narrowed to", async () => {
    const w = mountLines();
    useCanonUiStore().arcFilter = "a1";
    await w.find("input").setValue("Kindness is courage.");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(fake.rows("canon_entries")[0]).not.toHaveProperty("arc_id");
  });

  it("keeps the words in the box when the create fails, so the DM can try again", async () => {
    fake.failNext("canon_entries", { message: "boom" });
    const w = mountLines();
    await w.find("input").setValue("Kindness is courage.");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(boxValue(w)).toBe("Kindness is courage.");
    expect(fake.rows("canon_entries")).toEqual([]);
  });
});

describe("PremiseLines order (#1255 item 11)", () => {
  beforeEach(() => fake.reset());
  const row = (id: string, kind: "line" | "veil", sort_order: number) => canonEntry({ id, part: "premise", premise_kind: kind, title: id, sort_order });
  const RowStub = { props: ["entry", "move"], emits: ["move"], template: `<li :data-id="entry.id" :data-move="JSON.stringify(move)"><button @click="$emit('move', 1)">down</button></li>` };
  const mountKinds = (entries: CanonEntry[]) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useCampaignStore().activeCampaignId = "c1";
    return mount(PremiseLines, {
      props: { title: "Lines and veils", itemLabel: "Line", placeholder: "…", kinds: ["line", "veil"], entries },
      global: { plugins: [pinia, VueQueryPlugin], stubs: { PremiseLineRow: RowStub } },
    });
  };

  // Bug caught: a line moved past a veil (or swapped with it), so the two kinds' order tangled.
  it("moves a line only among the lines, leaving the veil between them where it is", async () => {
    const entries = [row("a", "line", 0), row("v", "veil", 1), row("b", "line", 2)];
    fake.seed("canon_entries", entries as never);
    const w = mountKinds(entries);
    await w.find("[data-id=a] button").trigger("click");
    await flushPromises();
    expect(Object.fromEntries(fake.rows("canon_entries").map((r) => [r.id, r.sort_order]))).toEqual({ a: 2, v: 1, b: 0 });
  });

  it("gives a lone veil no buttons: it has nowhere to go", () => {
    const w = mountKinds([row("a", "line", 0), row("v", "veil", 1), row("b", "line", 2)]);
    expect(w.find("[data-id=v]").attributes("data-move")).toBe("null");
    expect(w.find("[data-id=a]").attributes("data-move")).toBe(JSON.stringify({ first: true, last: false }));
  });
});
