import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EntityBacklinks from "./EntityBacklinks.vue";

const mocks = vi.hoisted(() => ({
  isSupported: { value: true },
  fire: undefined as undefined | ((entries: { isIntersecting: boolean }[]) => void),
  enabled: undefined as undefined | (() => boolean),
}));

vi.mock("@vueuse/core", () => ({
  useIntersectionObserver: (_t: unknown, cb: (entries: { isIntersecting: boolean }[]) => void) => {
    mocks.fire = cb;
    return { isSupported: mocks.isSupported };
  },
}));
vi.mock("@/composables/notes/useEntityBacklinks", () => ({
  useEntityBacklinks: (_id: unknown, enabled?: () => boolean) => {
    mocks.enabled = enabled;
    return { data: { value: [] } };
  },
}));

describe("EntityBacklinks", () => {
  beforeEach(() => {
    mocks.isSupported.value = true;
    mocks.enabled = undefined;
  });

  it("reads straight away by default", () => {
    mount(EntityBacklinks, { props: { entityId: "e1" }, global: { stubs: { RouterLink: true } } });
    expect(mocks.enabled?.()).toBe(true);
  });

  it("when lazy, waits for the section to scroll into view and then keeps reading", () => {
    mount(EntityBacklinks, { props: { entityId: "e1", lazy: true }, global: { stubs: { RouterLink: true } } });
    expect(mocks.enabled?.()).toBe(false);

    mocks.fire?.([{ isIntersecting: false }]);
    expect(mocks.enabled?.()).toBe(false);

    mocks.fire?.([{ isIntersecting: true }]);
    expect(mocks.enabled?.()).toBe(true);

    mocks.fire?.([{ isIntersecting: false }]);
    expect(mocks.enabled?.()).toBe(true);
  });

  it("when lazy but the browser cannot observe, reads immediately rather than never", () => {
    mocks.isSupported.value = false;
    mount(EntityBacklinks, { props: { entityId: "e1", lazy: true }, global: { stubs: { RouterLink: true } } });
    expect(mocks.enabled?.()).toBe(true);
  });
});
