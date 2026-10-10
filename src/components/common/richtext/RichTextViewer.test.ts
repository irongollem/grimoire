import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import RichTextViewer from "./RichTextViewer.vue";

vi.mock("@/ai/useImageJob", () => ({ waitForImageJob: vi.fn() }));
vi.mock("@/ai/useImageGeneration", () => ({ getLocalImageJob: vi.fn() }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn() }) }));
vi.mock("@/components/tiptap/PendingImageCard.vue", () => ({
  default: { props: ["status", "prompt", "startedAt", "editable"], template: '<div class="pending-stub" />' },
}));

import { waitForImageJob } from "@/ai/useImageJob";

const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (...content: object[]) => ({ type: "doc", content });

describe("RichTextViewer", () => {
  it("renders stored JSON, as an object or as a string", () => {
    const fromObject = mount(RichTextViewer, { props: { content: doc(para("Hello")) } });
    expect(fromObject.find(".ProseMirror p").text()).toBe("Hello");

    const fromString = mount(RichTextViewer, { props: { content: JSON.stringify(doc(para("Hi"))) } });
    expect(fromString.find(".ProseMirror p").text()).toBe("Hi");
  });

  it("shows non-JSON text as text, not markup", () => {
    const wrapper = mount(RichTextViewer, { props: { content: "<b>not bold</b>" } });
    expect(wrapper.find("b").exists()).toBe(false);
    expect(wrapper.find(".ProseMirror p").text()).toBe("<b>not bold</b>");
  });

  it("re-renders when the content prop changes, including to nothing", async () => {
    const wrapper = mount(RichTextViewer, { props: { content: doc(para("one")) } });
    await wrapper.setProps({ content: doc(para("two")) });
    expect(wrapper.find(".ProseMirror p").text()).toBe("two");
    await wrapper.setProps({ content: null });
    expect(wrapper.find(".ProseMirror p").text()).toBe("");
  });

  it("opens the lightbox for a clicked image and closes it again", async () => {
    const wrapper = mount(RichTextViewer, {
      props: { content: doc({ type: "image", attrs: { src: "https://cdn.test/a.png" } }) },
      attachTo: document.body,
    });
    await wrapper.find(".ProseMirror img").trigger("click");
    expect(document.body.querySelector("img.object-contain")?.getAttribute("src")).toBe("https://cdn.test/a.png");
    (document.body.querySelector(".cursor-zoom-out") as HTMLElement).click();
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector("img.object-contain")).toBeNull();
    wrapper.unmount();
  });

  it("swaps a pending image anchor for the finished image in place", async () => {
    vi.mocked(waitForImageJob).mockResolvedValue("https://img/done.webp");
    const wrapper = mount(RichTextViewer, {
      props: {
        content: doc(para("before"), {
          type: "pendingImage",
          attrs: { jobId: "viewer-job", prompt: "a dragon", status: "pending" },
        }),
      },
    });
    expect(wrapper.find(".pending-stub").exists()).toBe(true);

    await vi.waitFor(() => expect(wrapper.find(".ProseMirror img").attributes("src")).toBe("https://img/done.webp"));
    expect(wrapper.find(".pending-stub").exists()).toBe(false);
  });
});
