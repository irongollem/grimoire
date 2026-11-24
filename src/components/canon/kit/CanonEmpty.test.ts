import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";

vi.mock("@/composables/ask/useCanAsk", async () => {
  const { ref } = await import("vue");
  const can = ref(true);
  return { useCanAsk: () => can };
});

import CanonEmpty from "./CanonEmpty.vue";

describe("CanonEmpty", () => {
  // Bug caught: the empty card offering the Familiar with no request to send, or never offering it where the chapter wrote one.
  it("offers Ask the Familiar only when the chapter wrote a request", () => {
    const plain = mount(CanonEmpty, { props: { title: "No truths yet", text: "Write three." }, global: { plugins: [createPinia()] } });
    expect(plain.text()).toContain("No truths yet");
    expect(plain.find("[data-testid=canon-suggest]").exists()).toBe(false);
    const asked = mount(CanonEmpty, { props: { title: "No truths yet", text: "Write three.", ask: "Suggest three truths." }, global: { plugins: [createPinia()] } });
    expect(asked.get("[data-testid=canon-suggest]").text()).toBe("Ask the Familiar");
  });
});
