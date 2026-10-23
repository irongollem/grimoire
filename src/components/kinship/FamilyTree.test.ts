import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import FamilyTree from "./FamilyTree.vue";
import { key, makeSource } from "./testGraph";
import { selectAroundFocus } from "@/lib/kinship/select";

const mobile = ref(false);
vi.mock("@/composables/useBreakpoint", () => ({ useIsMobile: () => mobile, useIsTouch: () => ref(false) }));

function mountTree(focus = key("brenna"), extra: Record<string, unknown> = {}) {
  setActivePinia(createPinia());
  const source = makeSource();
  const sel = selectAroundFocus(source.graph.value, focus);
  return mount(FamilyTree, { props: { source, members: sel.members, folds: sel.folds, anchor: focus, focus, ...extra } });
}

describe("FamilyTree", () => {
  it("draws one card per member", () => {
    mobile.value = false;
    const w = mountTree();
    const names = w.findAll(".kin-name").map((n) => n.text());
    expect(names.sort()).toEqual(["Aldous", "Bren", "Brenna", "Corin", "Hesta", "Odile", "Tomas"].sort());
  });

  it("emits select with the person's key", async () => {
    mobile.value = false;
    const w = mountTree();
    const cards = w.findAllComponents({ name: "KinCard" });
    const tomas = cards.find((c) => c.text().includes("Tomas"));
    await tomas?.trigger("click");
    expect(w.emitted("select")?.[0]).toEqual([key("tomas")]);
  });

  it("offers a fold as a count button that emits unfold", async () => {
    mobile.value = false;
    // Centre on Brenna: Odile's branch is not hers, but Odile has no children; fold Bren's other line instead.
    const source = makeSource();
    setActivePinia(createPinia());
    const w = mount(FamilyTree, {
      props: {
        source,
        members: new Set([key("bren"), key("brenna")]),
        folds: new Map([[key("bren"), [key("tomas")]]]),
        anchor: key("brenna"),
        focus: key("brenna"),
      },
    });
    const fold = w.findAll("button").find((b) => b.text() === "1 child");
    expect(fold).toBeDefined();
    await fold?.trigger("click");
    expect(w.emitted("unfold")?.[0]).toEqual([key("bren")]);
  });

  it("keeps a gap between neighbours on every row", () => {
    mobile.value = false;
    const w = mountTree();
    const boxes = w.findAllComponents({ name: "KinCard" }).map((c) => {
      // The wrapper places the card (the torn edge owns the card's own position).
      const style = (c.element.parentElement as HTMLElement).style;
      return { left: parseFloat(style.left), width: parseFloat(style.width), top: parseFloat(style.top) };
    });
    const rows = new Map<number, typeof boxes>();
    for (const b of boxes) rows.set(b.top, [...(rows.get(b.top) ?? []), b]);
    for (const row of rows.values()) {
      row.sort((a, b) => a.left - b.left);
      for (let i = 1; i < row.length; i++) {
        const prev = row[i - 1];
        const cur = row[i];
        if (prev && cur) expect(cur.left).toBeGreaterThan(prev.left + prev.width);
      }
    }
  });

  it("labels each row with its median birth year", () => {
    mobile.value = false;
    const w = mountTree();
    expect(w.text()).toContain("born c. 1401");
  });

  it("zooms with the buttons and offers Fit", async () => {
    mobile.value = false;
    const w = mountTree();
    const stage = () => w.find("[style*='scale']").attributes("style");
    expect(stage()).toContain("scale(1)");
    await w.find("[aria-label='Zoom in']").trigger("click");
    expect(stage()).not.toContain("scale(1)");
    expect(w.text()).toContain("Fit");
  });

  it("draws strips per generation on a phone, with no lines", async () => {
    mobile.value = true;
    const w = mountTree();
    expect(w.find("svg").exists()).toBe(false);
    const headings = w.findAll("h3").map((h) => h.text());
    expect(headings.some((h) => h.startsWith("Grandparents"))).toBe(true);
    expect(headings.some((h) => h.startsWith("Parents"))).toBe(true);
    expect(headings.some((h) => h.startsWith("Brenna's generation"))).toBe(true);
    await w.findAll(".kin")[0]?.trigger("click");
    expect(w.emitted("select")).toHaveLength(1);
    mobile.value = false;
  });

  it("takes Space only while the pointer is over the tree, and shows the hand", async () => {
    mobile.value = false;
    const w = mountTree();
    const root = w.get("[role=group]");
    const space = () => new KeyboardEvent("keydown", { key: " ", code: "Space", cancelable: true });
    const away = space();
    window.dispatchEvent(away);
    expect(away.defaultPrevented).toBe(false);
    await root.trigger("pointerenter");
    const over = space();
    window.dispatchEvent(over);
    await w.vm.$nextTick();
    expect(over.defaultPrevented).toBe(true);
    expect(root.classes()).toContain("[&_*]:!cursor-grab");
    window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space" }));
    w.unmount();
  });
});
