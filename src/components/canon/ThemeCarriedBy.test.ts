import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { mount } from "@vue/test-utils";
import { canonEntry } from "@/test/canonEntry";

const entries = ref<ReturnType<typeof canonEntry>[]>([]);
const links = ref<Record<string, unknown>[]>([]);
const arcs = ref<Record<string, unknown>[]>([]);
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCanonEntries: () => ({ data: entries }) }));
vi.mock("@/composables/connections/useConnections", () => ({ useCampaignLinks: () => ({ data: links }) }));
vi.mock("@/composables/canon/useCanonArcs", () => ({ useCanonArcs: () => ({ data: arcs }) }));

import ThemeCarriedBy from "./ThemeCarriedBy.vue";

const theme = canonEntry({ id: "t1", part: "premise", premise_kind: "theme", title: "Debts are owed" });
const RouterLink = { props: ["to"], template: "<a :data-to='JSON.stringify(to)'><slot /></a>" };
const mountIt = () => mount(ThemeCarriedBy, { props: { entry: theme }, global: { stubs: { RouterLink } } });

describe("ThemeCarriedBy", () => {
  // Bug caught: a theme nothing carries drawing an empty "Carried by" instead of saying so.
  it("says nothing carries a theme that nothing carries", () => {
    entries.value = [theme];
    links.value = [];
    arcs.value = [];
    expect(mountIt().text()).toBe("Nothing carries this yet.");
  });

  // Bug caught: only links or only arcs read, so a theme an arc carries looks carried by nothing.
  it("lists the entries with a carries link to it and the arcs that name it, and no others", () => {
    entries.value = [theme, canonEntry({ id: "e1", title: "The mill", part: "truth" }), canonEntry({ id: "e2", title: "Unrelated", part: "truth" })];
    links.value = [
      { type: "carries", from_kind: "canon", from_id: "e1", to_kind: "canon", to_id: "t1" },
      { type: "carries", from_kind: "canon", from_id: "e2", to_kind: "canon", to_id: "t-other" },
      { type: "related_to", from_kind: "canon", from_id: "e2", to_kind: "canon", to_id: "t1" },
    ];
    arcs.value = [{ id: "a1", name: "The drowned god", theme_id: "t1" }, { id: "a2", name: "The guild", theme_id: "t-other" }];
    const w = mountIt();
    expect(w.findAll("[data-testid=theme-carrier]").map((a) => a.text())).toEqual(["The mill", "the arc The drowned god"]);
    expect(w.findAll("[data-testid=theme-carrier]")[1]!.attributes("data-to")).toBe(JSON.stringify("/canon/arcs?arc=a1"));
    expect(w.text()).not.toContain("Nothing carries");
  });
});
