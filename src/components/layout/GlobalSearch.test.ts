// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { useAskUiStore } from "@/stores/ui/ask";

const push = vi.fn();
const canAsk = ref(true);
vi.mock("vue-router", () => ({ useRouter: () => ({ push }), RouterLink: { template: "<a><slot /></a>" } }));
vi.mock("@/composables/ask/useCanAsk", () => ({ useCanAsk: () => canAsk }));
vi.mock("@/composables/useHotkeys", () => ({ useHotkeys: vi.fn() }));
vi.mock("@/composables/useLowArt", () => ({ useLowArt: () => ({ lowArt: ref(false) }) }));
vi.mock("@/composables/useGlobalSearch", () => ({
  failedGroupsMessage: () => "",
  useGlobalSearch: () => ({
    data: ref({ groups: [{ type: "npc", label: "NPCs", items: [{ id: "n1", name: "Mara", route: "/npcs/n1", matchedBy: "name" }] }], failedGroups: [] }),
    isFetching: ref(false),
    isError: ref(false),
    isSemanticPending: ref(false),
    showProUpsell: ref(false),
    dismissProUpsell: vi.fn(),
    thumbnails: ref({}),
  }),
}));

import GlobalSearch from "./GlobalSearch.vue";

async function typed(query: string) {
  const w = mount(GlobalSearch, { attachTo: document.body });
  const input = w.get("input");
  await input.trigger("focus");
  await input.setValue(query);
  return { w, input };
}

describe("GlobalSearch and Ask", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    push.mockClear();
    canAsk.value = true;
  });

  // Bug caught: the Ask row offered for a one-letter query, or never offered at all.
  it("offers Ask once two characters are typed, with the query under it", async () => {
    const one = await typed("M");
    expect(one.w.find('[data-testid="ask-search-row"]').exists()).toBe(false);
    one.w.unmount();
    const two = await typed("Mara");
    const row = two.w.get('[data-testid="ask-search-row"]');
    expect(row.text()).toContain("Ask your Familiar");
    expect(row.text()).toContain("Mara");
    two.w.unmount();
  });

  // Bug caught: Ask offered where it cannot run (a player, or a campaign with AI off).
  it("does not offer Ask where the shared rule says no", async () => {
    canAsk.value = false;
    const { w } = await typed("Mara");
    expect(w.find('[data-testid="ask-search-row"]').exists()).toBe(false);
    w.unmount();
  });

  // Bug caught: the Ask row doing nothing, or sending the query without opening the panel.
  it("opens the panel with the query when the row is pressed", async () => {
    const { w } = await typed("who is Mara");
    await w.get('[data-testid="ask-search-row"]').trigger("click");
    const ask = useAskUiStore();
    expect(ask.open).toBe(true);
    expect(ask.takePendingQuery()).toBe("who is Mara");
    w.unmount();
  });

  // Bug caught: mod+Enter being treated as a plain Enter (opening the result) or Ask taking plain Enter over.
  it("asks on Ctrl+Enter and leaves plain Enter doing what it did", async () => {
    const { w, input } = await typed("who is Mara");
    // Plain Enter with nothing focused does nothing, as before.
    await input.trigger("keydown", { key: "Enter" });
    expect(push).not.toHaveBeenCalled();
    expect(useAskUiStore().open).toBe(false);
    // With a result focused, plain Enter still opens it.
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/npcs/n1");
    await flushPromises();
    w.unmount();

    const again = await typed("who is Mara");
    await again.input.trigger("keydown", { key: "Enter", ctrlKey: true });
    expect(useAskUiStore().open).toBe(true);
    again.w.unmount();
  });

  // Bug caught: Ctrl+Enter on a one-letter query sending "M" to Grimoire as a question.
  it("does not ask on Ctrl+Enter before two characters are typed", async () => {
    const { w, input } = await typed("M");
    await input.trigger("keydown", { key: "Enter", ctrlKey: true });
    expect(useAskUiStore().open).toBe(false);
    w.unmount();
  });
});
