import { defineComponent, h, nextTick, ref } from "vue";
import type { Ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Deferred, controllable Previewer.preview() so tests can assert what's
// in-flight vs. settled around the debounce/coalescing logic.
const mocks = vi.hoisted(() => ({
  previewCalls: [] as string[],
  styles: [] as HTMLElement[],
  nextResolve: null as ((v: { total: number }) => void) | null,
  nextReject: null as ((e: Error) => void) | null,
}));

vi.mock("pagedjs", () => ({
  Handler: class {},
  registerHandlers: vi.fn(),
  Previewer: class {
    polisher = { inserted: [] as HTMLElement[] };
    preview(html: string) {
      mocks.previewCalls.push(html);
      // Each layout run leaves a <style> in the head, as the real polisher does.
      const style = document.createElement("style");
      document.head.appendChild(style);
      this.polisher.inserted.push(style);
      mocks.styles.push(style);
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

/** How many times the preview built its content: the expensive pass over the whole book. */
let contentBuilds = 0;

function mountPreview(contentRef: Ref<string>, debounceMs = 600) {
  const container = ref<HTMLElement | null>(document.createElement("div"));
  let api!: ReturnType<typeof usePagedPreview>;
  const wrapper = mount(
    defineComponent({
      setup() {
        api = usePagedPreview({
          content: () => {
            contentBuilds++;
            return contentRef.value;
          },
          changes: () => contentRef.value,
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
  contentBuilds = 0;
  mocks.previewCalls = [];
  mocks.styles = [];
  document.head.innerHTML = "";
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

  it("builds the content once per render, never on each change (#1115: a 533-page book froze on every keystroke)", async () => {
    const content = ref("<p>a</p>");
    mountPreview(content);
    for (const next of ["<p>ab</p>", "<p>abc</p>", "<p>abcd</p>"]) {
      content.value = next;
      await nextTick();
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(contentBuilds).toBe(0);
    await vi.advanceTimersByTimeAsync(600);
    expect(contentBuilds).toBe(1);
    expect(mocks.previewCalls).toEqual(["<p>abcd</p>"]);
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

  it("treats whitespace-only content as empty, and shows no pages after content is cleared", async () => {
    const content = ref("");
    const { api } = mountPreview(content);
    content.value = "<p>a</p>";
    await nextTick();
    await vi.advanceTimersByTimeAsync(600);
    settle(4);
    await flushPromises();
    expect(api().pageCount.value).toBe(4);

    content.value = "  \n ";
    await nextTick();
    await vi.advanceTimersByTimeAsync(600);
    expect(mocks.previewCalls).toHaveLength(1);
    expect(api().pageCount.value).toBe(0);
  });

  it("takes the previous layout's styles out of the head when a newer one is shown", async () => {
    const content = ref("");
    mountPreview(content);
    content.value = "<p>a</p>";
    await nextTick();
    await vi.advanceTimersByTimeAsync(600);
    settle();
    await flushPromises();
    content.value = "<p>b</p>";
    await nextTick();
    await vi.advanceTimersByTimeAsync(600);
    settle();
    await flushPromises();
    expect(mocks.styles).toHaveLength(2);
    expect(mocks.styles[0].isConnected).toBe(false);
    expect(mocks.styles[1].isConnected).toBe(true);
  });

  it("removes its styles on unmount, and does not report an error from a render that failed after it", async () => {
    const content = ref("");
    const { wrapper, api } = mountPreview(content);
    content.value = "<p>a</p>";
    await nextTick();
    await vi.advanceTimersByTimeAsync(600);
    const readApi = api();
    wrapper.unmount();
    mocks.nextReject?.(new Error("late failure"));
    await flushPromises();
    expect(readApi.error.value).toBeNull();
    expect(mocks.styles[0].isConnected).toBe(false);
  });

  it("removes the shown layout's styles when the component unmounts", async () => {
    const content = ref("");
    const { wrapper } = mountPreview(content);
    content.value = "<p>a</p>";
    await nextTick();
    await vi.advanceTimersByTimeAsync(600);
    settle();
    await flushPromises();
    expect(mocks.styles[0].isConnected).toBe(true);
    wrapper.unmount();
    expect(mocks.styles[0].isConnected).toBe(false);
  });

  it("clears the previous error when the next render starts", async () => {
    const content = ref("");
    const { api } = mountPreview(content);
    content.value = "<p>a</p>";
    await nextTick();
    await vi.advanceTimersByTimeAsync(600);
    mocks.nextReject?.(new Error("layout exploded"));
    await flushPromises();
    expect(api().error.value).toBe("layout exploded");
    content.value = "<p>b</p>";
    await nextTick();
    await vi.advanceTimersByTimeAsync(600);
    expect(api().error.value).toBeNull();
  });

  it("calls afterRender with the container once a layout is shown, and not for a discarded one", async () => {
    const afterRender = vi.fn();
    const content = ref("");
    const container = ref<HTMLElement | null>(document.createElement("div"));
    const host = mount(
      defineComponent({
        setup() {
          usePagedPreview({ content: () => content.value, changes: () => content.value, stylesheets: () => [], container, afterRender });
          return () => h("div");
        },
      }),
    );
    content.value = "<p>a</p>";
    await nextTick();
    await vi.advanceTimersByTimeAsync(600);
    expect(afterRender).not.toHaveBeenCalled();
    settle();
    await flushPromises();
    expect(afterRender).toHaveBeenCalledWith(container.value);
    host.unmount();
  });
});
