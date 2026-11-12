// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import NewSheetDialog from "./NewSheetDialog.vue";
import { STOCK_PAPERS } from "@/scriptorium/papers/papers";
import { PAINT_CANVAS_LIMIT_MESSAGE } from "@/scriptorium/illuminator/lib/paintQuota";

const mocks = vi.hoisted(() => ({ canCreate: { value: true }, upload: vi.fn() }));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: mocks.canCreate }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "u1" } }) }));
vi.mock("@/scriptorium/lib/panel/newSheetUpload", () => ({ uploadBlankSheet: mocks.upload }));
vi.mock("@/components/common/overlays/PaywallModal.vue", () => ({
  default: { name: "PaywallModal", props: ["modelValue", "resource", "message"], template: '<div data-testid="paywall" :data-open="modelValue" />' },
}));

function mountDialog() {
  return mount(NewSheetDialog, {
    props: { open: true, pageAspect: 0.707 },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  });
}

beforeEach(() => {
  mocks.canCreate = ref(true) as unknown as { value: boolean };
  mocks.upload.mockReset().mockResolvedValue("https://cdn/sheet.webp");
  document.body.innerHTML = "";
});

describe("NewSheetDialog", () => {
  it("offers every stock paper, so a paper added to STOCK_PAPERS is never missing from the sheet", () => {
    // Fails on: a hand-kept swatch list that drifts from STOCK_PAPERS (also catches template errors that only a mount shows).
    const w = mountDialog();
    const shown = [...document.body.querySelectorAll("[data-testid^='sheet-paper-']")].map((e) => e.getAttribute("data-testid"));
    expect(shown).toEqual(STOCK_PAPERS.map((p) => `sheet-paper-${p.id}`));
    expect(document.body.querySelectorAll("[data-testid^='sheet-size-']").length).toBe(4);
    w.unmount();
  });

  it("moves the chosen paper with the arrow keys and keeps one tab stop", async () => {
    // Fails on: a radio group the keyboard cannot move through.
    const w = mountDialog();
    const first = document.body.querySelector("[data-testid='sheet-paper-hot-press']") as HTMLElement;
    const chosen = document.body.querySelector("[data-testid='sheet-paper-cold-press']") as HTMLElement;
    expect(chosen.getAttribute("aria-checked")).toBe("true");
    expect(first.getAttribute("tabindex")).toBe("-1");
    chosen.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    await flushPromises();
    expect(first.getAttribute("aria-checked")).toBe("true");
    w.unmount();
  });

  it("shows the same upgrade message as the workbench", async () => {
    // Fails on: the generic paywall text replacing the canvas-specific one.
    mocks.canCreate = ref(false) as unknown as { value: boolean };
    const w = mountDialog();
    (document.body.querySelector("[data-testid='new-sheet-start']") as HTMLElement).click();
    await flushPromises();
    expect(w.findComponent({ name: "PaywallModal" }).props("message")).toBe(PAINT_CANVAS_LIMIT_MESSAGE);
    w.unmount();
  });

  it("emits the chosen paper and the exact size as a paint step", async () => {
    // Fails on: the recipe naming the default paper or a different size than the file that was made.
    const w = mountDialog();
    (document.body.querySelector("[data-testid='sheet-paper-kraft']") as HTMLElement).click();
    (document.body.querySelector("[data-testid='sheet-size-square']") as HTMLElement).click();
    await flushPromises();
    (document.body.querySelector("[data-testid='new-sheet-start']") as HTMLElement).click();
    await flushPromises();
    const [paper, size] = mocks.upload.mock.calls[0] as [{ id: string }, { width: number; height: number }, string];
    expect(paper.id).toBe("kraft");
    const created = w.emitted("created")![0]![0] as { url: string; recipe: { steps: unknown[] } };
    expect(created.recipe.steps).toEqual([{ type: "paint", width: size.width, height: size.height, paper: "kraft", layers: [] }]);
    expect(created.url).toBe("https://cdn/sheet.webp");
    w.unmount();
  });

  it("refuses to start, and shows the upgrade prompt, when the quota says no", async () => {
    // Fails on: a free account making a second painting canvas.
    mocks.canCreate = ref(false) as unknown as { value: boolean };
    const w = mountDialog();
    (document.body.querySelector("[data-testid='new-sheet-start']") as HTMLElement).click();
    await flushPromises();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(w.emitted("created")).toBeUndefined();
    expect(document.body.querySelector("[data-testid='paywall']")?.getAttribute("data-open")).toBe("true");
    w.unmount();
  });
});
