import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";

const canAsk = ref(true);
vi.mock("@/composables/ask/useCanAsk", () => ({ useCanAsk: () => canAsk }));

import { useAskUiStore } from "@/stores/ui/ask";
import CanonSuggest from "./CanonSuggest.vue";

describe("CanonSuggest", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    canAsk.value = true;
  });

  // Bug caught: the button opening the Familiar empty, or with its own words, so the DM had to retype what the page already knew.
  it("opens the Familiar with exactly the request", async () => {
    const w = mount(CanonSuggest, { props: { request: "Suggest three truths for my canon." } });
    await w.get("[data-testid=canon-suggest]").trigger("click");
    const ask = useAskUiStore();
    expect(ask.open).toBe(true);
    expect(ask.pendingQuery).toBe("Suggest three truths for my canon.");
  });

  // Bug caught: a Suggest button on a player's lens or a campaign with AI off, leading to a panel that is not there.
  it("is absent when this user may not ask", () => {
    canAsk.value = false;
    expect(mount(CanonSuggest, { props: { request: "x" } }).find("[data-testid=canon-suggest]").exists()).toBe(false);
  });

  it("labels itself Suggest unless told otherwise", () => {
    expect(mount(CanonSuggest, { props: { request: "x" } }).text()).toBe("Suggest");
    expect(mount(CanonSuggest, { props: { request: "x", label: "Ask the Familiar" } }).text()).toBe("Ask the Familiar");
  });
});
