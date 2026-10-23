import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    if (originalAnimate) Object.defineProperty(Element.prototype, "animate", originalAnimate);
    else Reflect.deleteProperty(Element.prototype, "animate");
  });

  function stubAnimate() {
    const finishers: (() => void)[] = [];
    const cancel = vi.fn();
    Object.defineProperty(Element.prototype, "animate", {
      configurable: true,
      value: () => ({
        cancel,
        finished: new Promise<void>((resolve) => {
          finishers.push(resolve);
        }),
      }),
    });
    return { finishers, cancel };
  }

  it("carries the old recto and the new verso on a leaf, then lets go", async () => {
    const { finishers } = stubAnimate();
    const w = mountTurn(at("a", 0, 1));
    await w.setProps({ target: at("a", 1, 2) });
    await nextTick();
    // Underneath: the old verso and the new recto. On the leaf: the old recto, and the new verso behind it.
    const base = w.findAll(".ob-pages > .face").map((f) => `${f.attributes("data-side")}=${f.attributes("data-target")}`);
    expect(base).toEqual(["verso=a:0", "recto=a:1"]);
    const leafFaces = w.findAll(".ob-leaf .face").map((f) => `${f.attributes("data-side")}=${f.attributes("data-target")}`);
    expect(leafFaces).toEqual(["recto=a:0", "verso=a:1"]);
    expect(w.emitted("done")).toBeUndefined();

    for (const finish of finishers) finish();
    await flushPromises();
    expect(w.findAll(".ob-leaf")).toHaveLength(0);
    expect(faces(w)).toEqual(["verso=a:1", "recto=a:1"]);
    expect(w.emitted("done")).toHaveLength(1);
  });

  it("turns back by carrying the new recto and the old verso", async () => {
    stubAnimate();
    const w = mountTurn(at("a", 1, 2));
    await w.setProps({ target: at("a", 0, 1) });
    await nextTick();
    const base = w.findAll(".ob-pages > .face").map((f) => `${f.attributes("data-side")}=${f.attributes("data-target")}`);
    expect(base).toEqual(["verso=a:0", "recto=a:1"]);
    const leafFaces = w.findAll(".ob-leaf .face").map((f) => `${f.attributes("data-side")}=${f.attributes("data-target")}`);
    expect(leafFaces).toEqual(["recto=a:0", "verso=a:1"]);
  });

  it("is not cut short by a cancelled turn reporting itself settled", async () => {
    const { finishers } = stubAnimate();
    const w = mountTurn(at("a", 0, 1));
    await w.setProps({ target: at("a", 1, 2) });
    await nextTick();
    await w.setProps({ target: at("a", 2, 3) });
    await nextTick();
    // The first turn's animations were cancelled; the browser reports them settled. The new leaf must survive that.
    finishers[0]?.();
    await flushPromises();
    expect(w.findAll(".ob-leaf")).toHaveLength(1);
    expect(w.emitted("done")).toBeUndefined();
  });
});
