import { defineComponent, h, nextTick, ref } from "vue";
import type { Ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Deferred, controllable Previewer.preview() so tests can assert what's
// in-flight vs. settled around the debounce/coalescing logic.
const mocks = vi.hoisted(() => ({
  previewCalls: [] as string[],
  nextResolve: null as ((v: { total: number }) => void) | null,
  nextReject: null as ((e: Error) => void) | null,
}));

vi.mock("pagedjs", () => ({
  Previewer: class {
    preview(html: string) {
      mocks.previewCalls.push(html);
      return new Promise((resolve, reject) => {
        mocks.nextResolve = resolve;
        mocks.nextReject = reject;
      });
    }
  },
}));

import { usePagedPreview } from "./usePagedPreview";

function settle(total = 3) {
  mocks.nextResolve?.({ total });
}

function mountPreview(contentRef: Ref<string>, debounceMs = 600) {
  const container = ref<HTMLElement | null>(document.createElement("div"));
  let api!: ReturnType<typeof usePagedPreview>;
  const wrapper = mount(
    defineComponent({
      setup() {
        api = usePagedPreview({
          content: () => contentRef.value,
          stylesheets: () => [],
          container,
          debounceMs,
        });
        return () => h("div");
      },
    }),
  );
  return { wrapper, api: () => api };
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.previewCalls = [];
  mocks.nextResolve = null;
  mocks.nextReject = null;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("usePagedPreview scheduling", () => {
  it("debounces: rapid content changes within the window trigger only one render", async () => {
    const content = ref("<p>a</p>");
    const { api } = mountPreview(content);
    content.value = "<p>ab</p>";
    await nextTick();
    await vi.advanceTimersByTimeAsync(300);
    content.value = "<p>abc</p>"; // resets the debounce timer before it fires
    await nextTick();
    await vi.advanceTimersByTimeAsync(300);
    expect(mocks.previewCalls).toHaveLength(0); // still within the 600ms window
    await vi.advanceTimersByTimeAsync(300);
    expect(mocks.previewCalls).toEqual(["<p>abc</p>"]);
    settle(5);
    await flushPromises();
    expect(api().pageCount.value).toBe(5);
  });

  it("does not call the previewer for empty content", async () => {
    const content = ref("");
    mountPreview(content);
    await vi.advanceTimersByTimeAsync(600);
    expect(mocks.previewCalls).toHaveLength(0);
  });

  it("coalesces a change that arrives while a render is in flight", async () => {
    // usePagedPreview only schedules on a CHANGE to content — there is no
    // immediate initial render — so start empty and set real content after
    // mount, matching how ScriptoriumPreviewPane's bodyHtml prop actually
    // transitions from "" to real HTML once the editor first loads.
    const content = ref("");
    mountPreview(content);
    content.value = "<p>a</p>";
    await nextTick();
    await vi.advanceTimersByTimeAsync(600);
    expect(mocks.previewCalls).toEqual(["<p>a</p>"]);

    // Change content again while the first render is still pending.
    content.value = "<p>b</p>";
    await nextTick();
    await vi.advanceTimersByTimeAsync(600); // debounce fires renderNow(), which coalesces (still rendering)
    expect(mocks.previewCalls).toHaveLength(1); // renderNow saw isRendering and set pendingRerender instead

    settle(2); // first render settles; the coalesced pending render now runs
    await flushPromises();
    expect(mocks.previewCalls).toHaveLength(2);
    expect(mocks.previewCalls[1]).toBe("<p>b</p>");
  });

  it("surfaces a rejected render as a readable error", async () => {
    const content = ref("");
    const { api } = mountPreview(content);
    content.value = "<p>a</p>";
    await nextTick();
    await vi.advanceTimersByTimeAsync(600);
    mocks.nextReject?.(new Error("layout exploded"));
    await flushPromises();
    expect(api().error.value).toBe("layout exploded");
    expect(api().isRendering.value).toBe(false);
  });

  it("discards a render that resolves after the component unmounted", async () => {
    const content = ref("");
    const { wrapper, api } = mountPreview(content);
    content.value = "<p>a</p>";
    await nextTick();
    await vi.advanceTimersByTimeAsync(600);
    expect(mocks.previewCalls).toHaveLength(1);
    const readApi = api(); // capture before unmount tears down the setup closure
    wrapper.unmount(); // bumps renderToken, invalidating the in-flight render
    settle(7); // resolves after the component is gone
    await flushPromises();
    // The stale resolve must not write state — pageCount stays at its default.
    expect(readApi.pageCount.value).toBe(0);
  });
});
