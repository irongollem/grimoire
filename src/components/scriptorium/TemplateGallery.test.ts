import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TemplateGallery from "./TemplateGallery.vue";
import { SCRIPTORIUM_TEMPLATES } from "@/data/scriptoriumTemplates";

const mocks = vi.hoisted(() => ({ startBook: vi.fn(), canCreate: { value: true } }));
vi.mock("@/composables/scriptorium/useStartScriptoriumDocument", () => ({
  useStartScriptoriumDocument: () => ({ startBook: mocks.startBook, isStarting: ref(false) }),
}));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: mocks.canCreate }) }));

const mountGallery = () =>
  mount(TemplateGallery, { global: { stubs: { PaywallModal: { props: ["modelValue"], template: '<i data-testid="paywall" :data-open="modelValue" />' } } } });

describe("TemplateGallery", () => {
  beforeEach(() => {
    mocks.startBook.mockReset().mockResolvedValue("book-id");
    mocks.canCreate.value = true;
  });

  it("picking a template creates the book from it and says so, leaving navigation to the view", async () => {
    const w = mountGallery();
    await w.findAll("button").find((b) => b.text().includes(SCRIPTORIUM_TEMPLATES[0].name))!.trigger("click");
    await flushPromises();
    expect(mocks.startBook).toHaveBeenCalledWith(SCRIPTORIUM_TEMPLATES[0]);
    expect(w.emitted("created")).toEqual([["book-id"]]);
  });

  it("creates nothing and shows the paywall when the quota is spent", async () => {
    mocks.canCreate.value = false;
    const w = mountGallery();
    await w.findAll("button")[0].trigger("click");
    await flushPromises();
    expect(mocks.startBook).not.toHaveBeenCalled();
    expect(w.emitted("created")).toBeUndefined();
    expect(w.get('[data-testid="paywall"]').attributes("data-open")).toBe("true");
  });

  it("says why when creating fails and emits nothing", async () => {
    mocks.startBook.mockRejectedValue(new Error("Offline"));
    const w = mountGallery();
    await w.findAll("button")[0].trigger("click");
    await flushPromises();
    expect(w.text()).toContain("Offline");
    expect(w.emitted("created")).toBeUndefined();
  });
});
