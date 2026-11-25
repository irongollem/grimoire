import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";
import CraftingRecipeView from "./CraftingRecipeView.vue";

vi.mock("@/composables/crafting/useCrafting", () => ({
  useCraftingRecipe: () => ({ data: ref(null) }),
}));

const stubs = {
  PageHeader: { props: ["title"], template: "<div><h1>{{ title }}</h1><slot /></div>" },
  RecipeEditor: { template: "<form data-editor />" },
  RecipeSheet: true,
};

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/crafting", component: { template: "<div />" } },
      { path: "/crafting/new", name: "crafting-new", component: CraftingRecipeView },
      { path: "/crafting/:id", name: "crafting-detail", component: CraftingRecipeView },
    ],
  });
  await router.push(path);
  const w = mount({ template: "<RouterView />" }, { global: { plugins: [router], stubs } });
  await flushPromises();
  return w;
}

describe("CraftingRecipeView", () => {
  // Bug #1281: New recipe said "Loading…" forever, because /crafting/new has no :id to read "new" from.
  it("opens the editor on /crafting/new", async () => {
    const w = await mountAt("/crafting/new");
    expect(w.find("h1").text()).toBe("New Recipe");
    expect(w.find("[data-editor]").exists()).toBe(true);
  });

  it("waits for an existing recipe instead of drawing a blank editor", async () => {
    const w = await mountAt("/crafting/r1");
    expect(w.find("h1").text()).toBe("Loading…");
    expect(w.find("[data-editor]").exists()).toBe(false);
  });
});
