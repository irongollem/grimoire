import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { createRouter, createMemoryHistory, RouterView, type Router } from "vue-router";
import { useUnsavedGuard, type UseUnsavedGuardOptions, type UseUnsavedGuardHandle } from "./useUnsavedGuard";

/**
 * Driven through a real router rather than a mocked one: the whole point of
 * this composable is *which* router hook fires for a given navigation, and a
 * mock would just replay whatever assumption the test author had.
 */

/** The handle from the editor's most recent mount, for the allowLeave() case. */
let handle: UseUnsavedGuardHandle | null = null;

const Editor = defineComponent({
  props: { opts: { type: Object as () => UseUnsavedGuardOptions, required: true } },
  setup(props) {
    handle = useUnsavedGuard(props.opts);
    return () => h("div", "editor");
  },
});

const Elsewhere = defineComponent({ setup: () => () => h("div", "elsewhere") });

async function mountAt(path: string, opts: UseUnsavedGuardOptions) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/edit/:id", name: "edit", component: Editor, props: () => ({ opts }) },
      { path: "/elsewhere", name: "elsewhere", component: Elsewhere },
    ],
  });
  router.push(path);
  await router.isReady();
  // `h(RouterView)` rather than `h("router-view")`: the string form builds a
  // plain HTML element, since globally registered components resolve only in
  // templates — the editor would never mount and the guard never register.
  const wrapper = mount(
    defineComponent({ setup: () => () => h(RouterView) }),
    { global: { plugins: [router] } },
  );
  return { router, wrapper };
}

/** Where the router actually ended up — the assertion that matters. */
function at(router: Router): string {
  return router.currentRoute.value.fullPath;
}

let ask: Mock<() => Promise<boolean>>;
beforeEach(() => {
  ask = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  handle = null;
});

describe("useUnsavedGuard", () => {
  it("lets a clean editor go without asking", async () => {
    const { router } = await mountAt("/edit/1", { isDirty: () => false, ask });
    await router.push("/elsewhere");
    expect(ask).not.toHaveBeenCalled();
    expect(at(router)).toBe("/elsewhere");
  });

  it("cancels the navigation when the question is refused", async () => {
    ask.mockResolvedValue(false);
    const { router } = await mountAt("/edit/1", { isDirty: () => true, ask });
    await router.push("/elsewhere");
    expect(ask).toHaveBeenCalledTimes(1);
    expect(at(router)).toBe("/edit/1");
  });

  it("allows it when the question is accepted", async () => {
    const { router } = await mountAt("/edit/1", { isDirty: () => true, ask });
    await router.push("/elsewhere");
    expect(ask).toHaveBeenCalledTimes(1);
    expect(at(router)).toBe("/elsewhere");
  });

  it("catches a same-route query change, which onBeforeRouteLeave never sees", async () => {
    // The reason the composable registers onBeforeRouteUpdate at all: dropping
    // `?edit=true` with the browser's Back button keeps the same route record,
    // so it is an update rather than a leave — while the parent's v-if may
    // still unmount the editor and take the unsaved work with it.
    ask.mockResolvedValue(false);
    const { router } = await mountAt("/edit/1?edit=true", { isDirty: () => true, ask });
    await router.push("/edit/1");
    expect(ask).toHaveBeenCalledTimes(1);
    expect(at(router)).toBe("/edit/1?edit=true");
  });

  it("stays quiet when the navigation leaves the editor mounted", async () => {
    const { router } = await mountAt("/edit/1?edit=true", {
      isDirty: () => true,
      survives: (to) => to.query.edit === "true",
      ask,
    });
    await router.push("/edit/1?edit=true&tab=notes");
    expect(ask).not.toHaveBeenCalled();
    expect(at(router)).toBe("/edit/1?edit=true&tab=notes");
  });

  it("waves through the component's own navigation after allowLeave()", async () => {
    const { router } = await mountAt("/edit/1", { isDirty: () => true, ask });
    handle!.allowLeave();
    await router.push("/elsewhere");
    expect(ask).not.toHaveBeenCalled();
    expect(at(router)).toBe("/elsewhere");
  });

  it("re-reads isDirty on every attempt rather than snapshotting it", async () => {
    const dirty = ref(false);
    const { router } = await mountAt("/edit/1", { isDirty: () => dirty.value, ask });
    await router.push("/elsewhere");
    expect(ask).not.toHaveBeenCalled();

    await router.push("/edit/1");
    dirty.value = true;
    ask.mockResolvedValue(false);
    await router.push("/elsewhere");
    expect(ask).toHaveBeenCalledTimes(1);
    expect(at(router)).toBe("/edit/1");
  });
});
