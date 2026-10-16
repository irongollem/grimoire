// @vitest-environment jsdom
import { flushPromises, mount, config } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import NoticeBoardPin from "./NoticeBoardPin.vue";
import { goat, grell, sealed, takenGoat, focalImageStub } from "./fixtures";
import { seededRotation, seededTack } from "@/lib/noticeBoard/geometry";

// FocalImage measures with a ResizeObserver the test DOM lacks.
config.global.stubs = { ...config.global.stubs, FocalImage: focalImageStub };

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error removing a stub installed by a test
  delete HTMLElement.prototype.animate;
});

describe("NoticeBoardPin", () => {
  it("is a real button named for its style and headline, at its fractional position", () => {
    const w = mount(NoticeBoardPin, { props: { face: goat } });
    const button = w.get("button.nb-hit");
    expect(button.attributes("aria-label")).toBe("Note: LOST: one goat");
    expect(w.attributes("style")).toContain("left: 10%");
    expect(w.attributes("style")).toContain("top: 20%");
  });

  it("tilts and tacks from its id, so it looks the same on every render", () => {
    const a = mount(NoticeBoardPin, { props: { face: goat } });
    const b = mount(NoticeBoardPin, { props: { face: goat } });
    expect(a.get(".nb-tilt").attributes("style")).toBe(b.get(".nb-tilt").attributes("style"));
    expect(a.get(".nb-tilt").attributes("style")).toContain(`rotate(${seededRotation("pin-goat")}deg)`);
    expect(a.get(".nb-tack").attributes("data-tack")).toBe(seededTack("pin-goat", "note"));
    expect(Math.abs(seededRotation("pin-goat"))).toBeLessThanOrEqual(4);
  });

  it("nails a wanted poster", () => {
    const w = mount(NoticeBoardPin, { props: { face: grell } });
    expect(w.get(".nb-tack").attributes("data-tack")).toBe("nail");
    expect(w.text()).toContain("Grell Ashmantle");
  });

  it("gives paper a cast shadow silhouette and a contact shadow wrapper, with the tilt on the child only", () => {
    const w = mount(NoticeBoardPin, { props: { face: sealed } });
    expect(w.find(".nb-cast").exists()).toBe(true);
    expect(w.get(".nb-lift").attributes("style") ?? "").not.toContain("rotate");
    expect(w.get(".nb-tilt").attributes("style")).toContain("rotate(");
    expect(w.get(".nb-cast").text()).toBe("");
  });

  it("selects on a click and reports the element to grow a reader from", async () => {
    const w = mount(NoticeBoardPin, { props: { face: goat } });
    await w.get("button.nb-hit").trigger("click");
    const [id, origin] = w.emitted("select")![0] as [string, HTMLElement];
    expect(id).toBe("pin-goat");
    expect(origin).toBe(w.element);
  });

  it("falls back to a coloured dot when the tack art fails", async () => {
    const w = mount(NoticeBoardPin, { props: { face: goat } });
    await w.get(".nb-tack img").trigger("error");
    expect(w.find(".nb-tack img").exists()).toBe(false);
    expect(w.find(".nb-tack").exists()).toBe(true);
  });

  describe("dragging, as the DM", () => {
    function board() {
      const host = document.createElement("div");
      host.setAttribute("data-board", "");
      host.getBoundingClientRect = () => ({ width: 1600, height: 1066.67, left: 0, top: 0, right: 1600, bottom: 1066.67, x: 0, y: 0, toJSON: () => ({}) });
      document.body.append(host);
      return host;
    }
    const ptr = (type: string, x: number, y: number) => new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, button: 0, bubbles: true });

    it("emits the dropped top-left as fractions, and a drag is not a selection", async () => {
      const host = board();
      const w = mount(NoticeBoardPin, { props: { face: goat, editable: true }, attachTo: host });
      const hit = w.get("button.nb-hit").element;
      hit.dispatchEvent(ptr("pointerdown", 100, 100));
      hit.dispatchEvent(ptr("pointermove", 260, 150));
      hit.dispatchEvent(ptr("pointerup", 260, 150));
      await w.get("button.nb-hit").trigger("click");
      expect(w.emitted("move")).toEqual([["pin-goat", 0.2, 0.247]]);
      expect(w.emitted("select")).toBeUndefined();
      host.remove();
    });

    it("keeps a click without movement as a selection", async () => {
      const host = board();
      const w = mount(NoticeBoardPin, { props: { face: goat, editable: true }, attachTo: host });
      const hit = w.get("button.nb-hit").element;
      hit.dispatchEvent(ptr("pointerdown", 100, 100));
      hit.dispatchEvent(ptr("pointerup", 101, 100));
      await w.get("button.nb-hit").trigger("click");
      expect(w.emitted("move")).toBeUndefined();
      expect(w.emitted("select")).toHaveLength(1);
      host.remove();
    });

    it("cannot be dragged off the board", async () => {
      const host = board();
      const w = mount(NoticeBoardPin, { props: { face: goat, editable: true }, attachTo: host });
      const hit = w.get("button.nb-hit").element;
      hit.dispatchEvent(ptr("pointerdown", 100, 100));
      hit.dispatchEvent(ptr("pointermove", 9000, 9000));
      hit.dispatchEvent(ptr("pointerup", 9000, 9000));
      const [, x, y] = w.emitted("move")![0] as [string, number, number];
      expect(x).toBeCloseTo(1 - 300 / 1600, 3);
      expect(y).toBeCloseTo(1 - 270 / 1066.67, 2);
      host.remove();
    });

    it("does nothing for a player", () => {
      const host = board();
      const w = mount(NoticeBoardPin, { props: { face: goat }, attachTo: host });
      const hit = w.get("button.nb-hit").element;
      hit.dispatchEvent(ptr("pointerdown", 100, 100));
      hit.dispatchEvent(ptr("pointermove", 400, 400));
      hit.dispatchEvent(ptr("pointerup", 400, 400));
      expect(w.emitted("move")).toBeUndefined();
      host.remove();
    });
  });

  describe("taken", () => {
    it("mounts as a stub when already taken, with no paper and no button over it", () => {
      const w = mount(NoticeBoardPin, { props: { face: takenGoat } });
      expect(w.attributes("data-phase")).toBe("stub");
      expect(w.find(".nb-lift").exists()).toBe(false);
      expect(w.find("button.nb-hit").exists()).toBe(false);
      expect(w.find(".nb-tack").exists()).toBe(true);
    });

    it("shows who took it when the stub is tapped, and hides it on a second tap", async () => {
      const w = mount(NoticeBoardPin, { props: { face: takenGoat } });
      await w.get("button.nb-stub").trigger("click");
      expect(w.text()).toContain("Taken by Aria, session 12");
      await w.get("button.nb-stub").trigger("click");
      expect(w.text()).not.toContain("Taken by Aria");
    });

    it("goes straight to the stub when there is nothing to animate with", async () => {
      const w = mount(NoticeBoardPin, { props: { face: goat } });
      await w.setProps({ face: takenGoat });
      expect(w.attributes("data-phase")).toBe("stub");
      expect(w.find(".nb-lift").exists()).toBe(false);
    });

    it("tears off while mounted: lifts, twists away, then leaves the stub under its tack", async () => {
      const calls: Keyframe[][] = [];
      let finish: () => void = () => {};
      const finished = new Promise<void>((resolve) => (finish = resolve));
      HTMLElement.prototype.animate = vi.fn((frames: Keyframe[]) => {
        calls.push(frames);
        return { finished } as unknown as Animation;
      });
      const w = mount(NoticeBoardPin, { props: { face: goat } });
      await w.setProps({ face: takenGoat });
      await flushPromises();
      expect(w.attributes("data-phase")).toBe("tearing");
      // Paper and its cast shadow both move; the stub is already underneath.
      expect(calls).toHaveLength(2);
      expect(w.find("button.nb-stub").exists()).toBe(true);
      expect(w.find("button.nb-hit").exists()).toBe(false);
      finish();
      await flushPromises();
      expect(w.attributes("data-phase")).toBe("stub");
      expect(w.find(".nb-lift").exists()).toBe(false);
      expect(w.find(".nb-tack").exists()).toBe(true);
    });

    it("puts the paper back when the DM pins it up again", async () => {
      const w = mount(NoticeBoardPin, { props: { face: takenGoat } });
      await w.setProps({ face: goat });
      expect(w.attributes("data-phase")).toBe("up");
      expect(w.find("button.nb-hit").exists()).toBe(true);
    });
  });
});
