import { mount, RouterLinkStub } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EntityBacklinks from "./EntityBacklinks.vue";

const mocks = vi.hoisted(() => ({
  isSupported: { value: true },
  fire: undefined as undefined | ((entries: { isIntersecting: boolean }[]) => void),
  enabled: undefined as undefined | (() => boolean),
  links: [] as { kind: string; id: string; title: string; to: string }[],
}));

vi.mock("@vueuse/core", () => ({
  useIntersectionObserver: (_t: unknown, cb: (entries: { isIntersecting: boolean }[]) => void) => {
    mocks.fire = cb;
    return { isSupported: mocks.isSupported };
  },
}));
vi.mock("@/composables/notes/useEntityBacklinks", async () => {
  const { ref } = await import("vue");
  return {
    useEntityBacklinks: (_id: unknown, enabled?: () => boolean) => {
      mocks.enabled = enabled;
      return { data: ref(mocks.links) };
    },
  };
});

describe("EntityBacklinks", () => {
  beforeEach(() => {
    mocks.isSupported.value = true;
    mocks.enabled = undefined;
    mocks.links = [];
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

  it("says so when nothing mentions the entity, and lists each mention as a link to where it is written", () => {
    const empty = mount(EntityBacklinks, { props: { entityId: "e1" }, global: { stubs: { RouterLink: RouterLinkStub } } });
    expect(empty.text()).toContain("Not mentioned anywhere yet.");
    expect(empty.findAllComponents(RouterLinkStub)).toHaveLength(0);

    mocks.links = [
      { kind: "note", id: "n1", title: "Session 4", to: "/notes/n1" },
      { kind: "npc", id: "n1", title: "Old Harl", to: "/npcs/n1" },
    ];
    const full = mount(EntityBacklinks, { props: { entityId: "e1" }, global: { stubs: { RouterLink: RouterLinkStub } } });
    expect(full.text()).not.toContain("Not mentioned anywhere yet.");
    expect(full.findAllComponents(RouterLinkStub).map((l) => [l.text(), l.props("to")])).toEqual([
      ["Session 4", "/notes/n1"],
      ["Old Harl", "/npcs/n1"],
    ]);
  });
});
