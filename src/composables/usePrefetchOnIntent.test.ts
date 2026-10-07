import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, withDirectives } from "vue";
import { mount } from "@vue/test-utils";

const prefetchRouteComponents = vi.fn();
const prefetchRouteData = vi.fn();
vi.mock("@/router/routeChunks", () => ({ prefetchRouteComponents: (...args: unknown[]) => prefetchRouteComponents(...args) }));
vi.mock("@/router/routeDataPrefetch", () => ({ prefetchRouteData: (...args: unknown[]) => prefetchRouteData(...args) }));
vi.mock("vue-router", () => ({ useRouter: () => ({ id: "router" }) }));
vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({ id: "client" }) }));

import { usePrefetchOnIntent } from "./usePrefetchOnIntent";

const Host = defineComponent({
  props: { to: { type: String, default: "/npcs" } },
  setup(props) {
    const vPrefetch = usePrefetchOnIntent(80);
    return () => withDirectives(h("a", { href: props.to }), [[vPrefetch, props.to]]);
  },
});

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  prefetchRouteComponents.mockClear();
  prefetchRouteData.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("usePrefetchOnIntent", () => {
  it("waits for the pointer to rest before starting", async () => {
    const wrapper = mount(Host);
    await wrapper.trigger("pointerenter");
    vi.advanceTimersByTime(79);
    expect(prefetchRouteComponents).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await vi.dynamicImportSettled();
    await flush();
    expect(prefetchRouteComponents).toHaveBeenCalledWith({ id: "router" }, "/npcs");
    expect(prefetchRouteData).toHaveBeenCalledWith({ id: "client" }, "/npcs");
  });

  it("does nothing for a pass-over", async () => {
    const wrapper = mount(Host);
    await wrapper.trigger("pointerenter");
    vi.advanceTimersByTime(40);
    await wrapper.trigger("pointerleave");
    vi.advanceTimersByTime(200);
    expect(prefetchRouteComponents).not.toHaveBeenCalled();
  });

  it("starts at once on focus and on touch", async () => {
    const wrapper = mount(Host);
    await wrapper.trigger("focus");
    await wrapper.trigger("touchstart");
    expect(prefetchRouteComponents).toHaveBeenCalledTimes(2);
  });

  it("follows a changed destination and stops listening on unmount", async () => {
    const wrapper = mount(Host);
    await wrapper.setProps({ to: "/quests" });
    await wrapper.trigger("focus");
    expect(prefetchRouteComponents).toHaveBeenLastCalledWith({ id: "router" }, "/quests");
    const el = wrapper.element;
    wrapper.unmount();
    el.dispatchEvent(new Event("focus"));
    expect(prefetchRouteComponents).toHaveBeenCalledTimes(1);
  });
});
