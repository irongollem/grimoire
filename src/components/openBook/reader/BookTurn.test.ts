import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { h, nextTick } from "vue";
import BookTurn from "./BookTurn.vue";
import type { PageTarget } from "./readerContext";

const at = (key: string, unit: number, order: number): PageTarget => ({ key, unit, order });

function mountTurn(target: PageTarget, mode: "spread" | "single" = "spread") {
  return mount(BookTurn, {
    props: { target, mode },
    slots: {
      page: ({ target: t, side }: { target: PageTarget; side: string }) =>
        h("div", { class: "face", "data-side": side, "data-target": `${t.key}:${t.unit}` }),
    },
  });
}

const faces = (w: ReturnType<typeof mountTurn>) => w.findAll(".face").map((f) => `${f.attributes("data-side")}=${f.attributes("data-target")}`);

describe("BookTurn", () => {
  it("shows the open spread, verso then recto", () => {
    const w = mountTurn(at("a", 0, 1));
    expect(faces(w)).toEqual(["verso=a:0", "recto=a:0"]);
  });

  it("shows one page in single mode", () => {
    const w = mountTurn(at("a", 0, 1), "single");
    expect(faces(w)).toEqual(["recto=a:0"]);
  });

  it("lands on the new target and says it is done when animation is unavailable", async () => {
    const w = mountTurn(at("a", 0, 1));
    await w.setProps({ target: at("a", 1, 2) });
    await nextTick();
    expect(faces(w)).toEqual(["verso=a:1", "recto=a:1"]);
    expect(w.findAll(".ob-leaf")).toHaveLength(0);
    expect(w.emitted("done")).toHaveLength(1);
  });

  it("turns backwards across sections the same way", async () => {
    const w = mountTurn(at("b", 0, 10_000));
    await w.setProps({ target: at("a", 3, 3) });
    await nextTick();
    expect(faces(w)).toEqual(["verso=a:3", "recto=a:3"]);
  });

  it("shows a corrected target at once and finishes", async () => {
    const w = mountTurn(at("a", 5, 5));
    await w.setProps({ target: at("a", 2, 2), instant: true });
    expect(faces(w)).toEqual(["verso=a:2", "recto=a:2"]);
    expect(w.emitted("done")).toHaveLength(1);
  });

  it("does nothing for the same target", async () => {
    const w = mountTurn(at("a", 0, 1));
    await w.setProps({ target: at("a", 0, 1) });
    expect(w.emitted("done")).toBeUndefined();
  });
});

describe("BookTurn with animation available", () => {
  const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, "animate");
  let queue: ((now: number) => void)[] = [];
  let clock = 0;
  const cancelled = vi.fn();

  beforeEach(() => {
    queue = [];
    clock = 0;
    cancelled.mockClear();
    // canAnimate only asks whether Web Animations exist; the curl itself runs on requestAnimationFrame.
    Object.defineProperty(Element.prototype, "animate", { configurable: true, value: () => ({ cancel: vi.fn(), finished: Promise.resolve() }) });
    vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) => {
      queue.push(cb);
      return queue.length;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      cancelled(id);
      queue[id - 1] = () => undefined;
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalAnimate) Object.defineProperty(Element.prototype, "animate", originalAnimate);
    else Reflect.deleteProperty(Element.prototype, "animate");
  });

  /** Run the next queued frame `ms` after the last one. */
  function tick(ms: number) {
    const cb = queue.shift();
    clock += ms;
    cb?.(clock);
  }

  it("carries the old recto and the new verso on a leaf, then lets go", async () => {
    const w = mountTurn(at("a", 0, 1));
    await w.setProps({ target: at("a", 1, 2) });
    await nextTick();
    // Underneath: the old verso and the new recto. On the leaf: the old recto, and the new verso behind it.
    const base = w.findAll(".ob-pages > .face").map((f) => `${f.attributes("data-side")}=${f.attributes("data-target")}`);
    expect(base).toEqual(["verso=a:0", "recto=a:1"]);
    const leafFaces = w.findAll(".ob-leaf .face").map((f) => `${f.attributes("data-side")}=${f.attributes("data-target")}`);
    expect(leafFaces).toEqual(["recto=a:0", "verso=a:1"]);
    expect(w.emitted("done")).toBeUndefined();

    tick(1);
    tick(450);
    await flushPromises();
    expect(w.findAll(".ob-leaf")).toHaveLength(1);
    // Mid-turn the face is cut by the fold and the back is carried over it.
    expect((w.find('[data-layer="front"]').element as HTMLElement).style.clipPath).toContain("polygon");
    expect((w.find(".ob-leaf-backpage").element as HTMLElement).style.transform).toContain("matrix(");

    tick(500);
    await flushPromises();
    expect(w.findAll(".ob-leaf")).toHaveLength(0);
    expect(faces(w)).toEqual(["verso=a:1", "recto=a:1"]);
    expect(w.emitted("done")).toHaveLength(1);
  });

  it("turns back by carrying the new recto and the old verso", async () => {
    const w = mountTurn(at("a", 1, 2));
    await w.setProps({ target: at("a", 0, 1) });
    await nextTick();
    const base = w.findAll(".ob-pages > .face").map((f) => `${f.attributes("data-side")}=${f.attributes("data-target")}`);
    expect(base).toEqual(["verso=a:0", "recto=a:1"]);
    const leafFaces = w.findAll(".ob-leaf .face").map((f) => `${f.attributes("data-side")}=${f.attributes("data-target")}`);
    expect(leafFaces).toEqual(["recto=a:0", "verso=a:1"]);
    tick(1);
    tick(1000);
    await flushPromises();
    expect(w.emitted("done")).toHaveLength(1);
  });

  it("finishes the old turn and starts a new leaf when interrupted, saying done once at the end", async () => {
    const w = mountTurn(at("a", 0, 1));
    await w.setProps({ target: at("a", 1, 2) });
    await nextTick();
    tick(1);
    tick(200);
    await w.setProps({ target: at("a", 2, 3) });
    await nextTick();
    expect(cancelled).toHaveBeenCalled();
    // The first turn's pending frame must not finish the new leaf.
    tick(100);
    expect(w.findAll(".ob-leaf")).toHaveLength(1);
    expect(w.emitted("done")).toBeUndefined();
    const leafFaces = w.findAll(".ob-leaf .face").map((f) => `${f.attributes("data-side")}=${f.attributes("data-target")}`);
    expect(leafFaces).toEqual(["recto=a:1", "verso=a:2"]);
    for (let i = 0; i < 12; i += 1) tick(100);
    await flushPromises();
    expect(w.findAll(".ob-leaf")).toHaveLength(0);
    expect(w.emitted("done")).toHaveLength(1);
  });

  it("stops its frames when unmounted mid-turn", async () => {
    const w = mountTurn(at("a", 0, 1));
    await w.setProps({ target: at("a", 1, 2) });
    await nextTick();
    tick(1);
    w.unmount();
    expect(cancelled).toHaveBeenCalled();
    tick(2000);
  });

  it("cross-fades under reduced motion and says done once", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const w = mountTurn(at("a", 0, 1));
    await w.setProps({ target: at("a", 1, 2) });
    await flushPromises();
    expect(w.findAll(".ob-leaf")).toHaveLength(0);
    expect(faces(w)).toEqual(["verso=a:1", "recto=a:1"]);
    expect(queue).toHaveLength(0);
    expect(w.emitted("done")).toHaveLength(1);
  });
});
