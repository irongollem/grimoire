import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";

vi.mock("@/composables/ask/useCanAsk", async () => {
  const { ref } = await import("vue");
  const can = ref(true);
  return { useCanAsk: () => can };
});

import CanonBlock from "./CanonBlock.vue";

const mountBlock = (props: { title: string; suggest?: string }) => mount(CanonBlock, { props, slots: { default: "<p>inside</p>" }, global: { plugins: [createPinia()] } });

describe("CanonBlock", () => {
  // Bug caught: a block offering Suggest with no request behind it, so the button opened the Familiar on nothing.
  it("shows a Suggest only when the chapter gave it a request", () => {
    expect(mountBlock({ title: "Who knows it" }).find("[data-testid=canon-suggest]").exists()).toBe(false);
    expect(mountBlock({ title: "Clues", suggest: "Suggest clues." }).find("[data-testid=canon-suggest]").exists()).toBe(true);
  });
});
