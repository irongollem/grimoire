import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { isImageFile, usePasteFiles } from "./usePasteFiles";

const mounted: VueWrapper[] = [];

async function zone(opts: { accept?: (f: File) => boolean; enabled?: () => boolean } = {}) {
  const onFiles = vi.fn();
  const wrapper = mount(
    defineComponent({
      setup() {
        const el = ref<HTMLElement | null>(null);
        usePasteFiles(el, onFiles, opts);
        return () => h("div", { ref: el }, [h("button", "pick"), h("input", { type: "text" }), h("input", { type: "file" })]);
      },
    }),
    { attachTo: document.body },
  );
  mounted.push(wrapper);
  const el = wrapper.element as HTMLElement;
  await nextTick(); // vueuse binds element listeners after the render
  return {
    onFiles,
    wrapper,
    el,
    hover: () => el.dispatchEvent(new Event("pointerenter")),
    leave: () => el.dispatchEvent(new Event("pointerleave")),
  };
}

const png = new File(["x"], "shot.png", { type: "image/png" });
const pdf = new File(["x"], "notes.pdf", { type: "application/pdf" });

/** Pastes `files` with focus wherever it is; returns whether a zone took the event. */
function paste(files: File[], target: EventTarget = document.activeElement ?? document.body): boolean {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { files } });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  (document.activeElement as HTMLElement | null)?.blur();
});

describe("usePasteFiles", () => {
  it("sends a paste to the zone under the pointer, not to one holding focus elsewhere", async () => {
    const focusedZone = await zone();
    const hoveredZone = await zone();
    focusedZone.el.querySelector("button")!.focus();
    hoveredZone.hover();

    expect(paste([png])).toBe(true);
    expect(hoveredZone.onFiles).toHaveBeenCalledWith([png]);
    expect(focusedZone.onFiles).not.toHaveBeenCalled();
  });

  it("with nothing hovered, sends it to the zone holding focus, its own file picker included", async () => {
    const other = await zone();
    const target = await zone();
    target.el.querySelector<HTMLInputElement>('input[type="file"]')!.focus();

    paste([png]);
    expect(target.onFiles).toHaveBeenCalledWith([png]);
    expect(other.onFiles).not.toHaveBeenCalled();
  });

  it("stops taking pastes once the pointer leaves", async () => {
    const z = await zone();
    z.hover();
    z.leave();
    expect(paste([png])).toBe(false);
    expect(z.onFiles).not.toHaveBeenCalled();
  });

  it("leaves a paste into a text field to the field, even with the pointer over a zone", async () => {
    const z = await zone();
    z.hover();
    const field = z.el.querySelector<HTMLInputElement>('input[type="text"]')!;
    field.focus();

    expect(paste([png], field)).toBe(false);
    expect(z.onFiles).not.toHaveBeenCalled();
  });

  it("ignores clipboard files the zone does not accept, so the paste carries on as normal", async () => {
    const z = await zone({ accept: isImageFile });
    z.hover();
    expect(paste([pdf])).toBe(false);
    expect(z.onFiles).not.toHaveBeenCalled();

    paste([pdf, png]);
    expect(z.onFiles).toHaveBeenCalledWith([png]);
  });

  it("a disabled zone (uploading) takes nothing", async () => {
    const z = await zone({ enabled: () => false });
    z.hover();
    expect(paste([png])).toBe(false);
    expect(z.onFiles).not.toHaveBeenCalled();
  });

  it("an unmounted zone takes nothing", async () => {
    const z = await zone();
    z.hover();
    z.wrapper.unmount();
    mounted.splice(mounted.indexOf(z.wrapper), 1);
    expect(paste([png])).toBe(false);
    expect(z.onFiles).not.toHaveBeenCalled();
  });
});
