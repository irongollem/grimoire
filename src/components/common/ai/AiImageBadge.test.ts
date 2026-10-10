import { describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const mocks = vi.hoisted(() => ({ hit: true }));

vi.mock("@/lib/storage", () => ({
  imageProvenanceKey: (url: string) => (url.startsWith("https://cdn.test/") ? { bucket: "npc-portraits", stem: url.slice(17) } : null),
  loadImageProvenance: vi.fn(async () =>
    mocks.hit ? { model: "gpt-image-2", provider: "openai", generatedAt: "2026-09-01T10:00:00Z" } : null,
  ),
}));

import AiImageBadge from "./AiImageBadge.vue";

function mountBadge(props: Record<string, unknown>, attrs: Record<string, unknown> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return mount(AiImageBadge, { props: props as never, attrs, global: { plugins: [[VueQueryPlugin, { queryClient }]] } });
}

describe("AiImageBadge", () => {
  it("shows the chip for an image the registry knows, tooltip from the record", async () => {
    mocks.hit = true;
    const w = mountBadge({ src: "https://cdn.test/hit.webp" });
    await flushPromises();
    expect(w.text()).toContain("AI");
    expect(w.find("span").attributes("title")).toContain("Model: gpt-image-2 (openai)");
  });

  it("renders nothing for an image the registry has no record of", async () => {
    mocks.hit = false;
    const w = mountBadge({ src: "https://cdn.test/miss.webp" });
    await flushPromises();
    expect(w.find("span").exists()).toBe(false);
  });

  it("renders the chip once an initially missing src becomes a registered URL", async () => {
    mocks.hit = true;
    const w = mountBadge({ src: undefined });
    await flushPromises();
    expect(w.find("span").exists()).toBe(false);
    await w.setProps({ src: "https://cdn.test/late.webp" });
    await flushPromises();
    expect(w.find("span").exists()).toBe(true);
  });

  it("renders nothing for a blob URL", async () => {
    mocks.hit = true;
    const w = mountBadge({ src: "blob:http://x/1" });
    await flushPromises();
    expect(w.find("span").exists()).toBe(false);
  });

  it("passes class and corner through to the chip", async () => {
    mocks.hit = true;
    const w = mountBadge({ src: "https://cdn.test/hit2.webp", corner: "left" }, { class: "bottom-9!" });
    await flushPromises();
    const chip = w.find("span");
    expect(chip.classes()).toContain("bottom-9!");
    expect(chip.classes()).toContain("left-1.5");
  });
});
