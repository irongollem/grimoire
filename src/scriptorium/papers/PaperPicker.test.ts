// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PaperPicker from "./PaperPicker.vue";
import { STOCK_PAPERS } from "./papers";

function mountPicker(props: { modelValue: string | null; allowNone?: boolean; veiled?: boolean }) {
  return mount(PaperPicker, { props: props as never, attachTo: document.body });
}
const shown = () => [...document.body.querySelectorAll("[data-testid^='paper-']")].map((e) => e.getAttribute("data-testid"));

describe("PaperPicker", () => {
  it("offers every stock paper, so a paper added to STOCK_PAPERS is never missing", () => {
    // Fails on: a hand-kept swatch list that drifts from STOCK_PAPERS (also catches template errors that only a mount shows).
    const w = mountPicker({ modelValue: "kraft" });
    expect(shown()).toEqual(STOCK_PAPERS.map((p) => `paper-${p.id}`));
    w.unmount();
  });

  it("offers 'none' first only when asked, and picking it emits null", async () => {
    // Fails on: a document that can never go back to its look's own paper, or a null that leaks into a painting's picker.
    const without = mountPicker({ modelValue: "kraft" });
    expect(shown()).not.toContain("paper-none");
    without.unmount();
    const w = mountPicker({ modelValue: "kraft", allowNone: true });
    expect(shown()[0]).toBe("paper-none");
    (document.body.querySelector("[data-testid='paper-none']") as HTMLElement).click();
    expect(w.emitted("update:modelValue")![0]).toEqual([null]);
    w.unmount();
  });

  it("marks the null choice checked when no paper is set", () => {
    // Fails on: a settings dialog that shows no paper selected for a document on the look's own paper.
    const w = mountPicker({ modelValue: null, allowNone: true });
    expect(document.body.querySelector("[data-testid='paper-none']")?.getAttribute("aria-checked")).toBe("true");
    w.unmount();
  });

  it("moves the choice with the arrow keys and keeps one tab stop", async () => {
    // Fails on: a radio group the keyboard cannot move through.
    const w = mountPicker({ modelValue: "cold-press" });
    const chosen = document.body.querySelector("[data-testid='paper-cold-press']") as HTMLElement;
    expect(chosen.getAttribute("aria-checked")).toBe("true");
    expect(document.body.querySelector("[data-testid='paper-hot-press']")?.getAttribute("tabindex")).toBe("-1");
    chosen.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    await flushPromises();
    expect(w.emitted("update:modelValue")![0]).toEqual(["hot-press"]);
    w.unmount();
  });

  it("wraps from the last paper to the first with ArrowRight", async () => {
    // Fails on: the arrow keys running off the end of the list.
    const w = mountPicker({ modelValue: "warm-grey" });
    (document.body.querySelector("[data-testid='paper-warm-grey']") as HTMLElement).dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(w.emitted("update:modelValue")![0]).toEqual(["hot-press"]);
    w.unmount();
  });

  it("lays a paper's veil over its swatch only for a page, never for a painting", () => {
    // Fails on: a painting's picker showing papers washed out, or a page's picker showing a darker paper than the page has.
    const plain = mountPicker({ modelValue: "kraft" });
    const swatch = () => (document.body.querySelector("[data-testid='paper-kraft'] span") as HTMLElement).style.backgroundImage;
    expect(swatch()).not.toContain("linear-gradient");
    plain.unmount();
    const veiled = mountPicker({ modelValue: "kraft", veiled: true });
    expect(swatch()).toContain("linear-gradient");
    veiled.unmount();
  });
});
