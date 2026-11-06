// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  parts: null as unknown,
  requireCredits: vi.fn(() => true),
  addFromStock: vi.fn(async () => true),
  addFromBlob: vi.fn(async () => true),
  paint: vi.fn(async () => new Blob(["p"])),
  lift: vi.fn(async () => new Blob(["l"])),
  png: new Blob(["png"], { type: "image/png" }),
  ai: true,
  runLift: vi.fn(async () => ({ notice: null })),
  deps: vi.fn(() => ({})),
  loadImage: vi.fn(() => new Promise(() => {})),
}));

vi.mock("@/composables/bookNook/useLibraryNookParts", () => ({ useLibraryNookParts: () => h.parts }));
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ requireCredits: h.requireCredits }) }));
vi.mock("@/ai/useNookPartGeneration", () => ({
  useNookPartCost: () => ({ picture: ref(3) }),
  useNookPartGeneration: () => ({ paint: h.paint, lift: h.lift, fill: vi.fn() }),
}));
vi.mock("@/composables/bookNook/useAddCutout", () => ({
  useAddCutout: () => ({ add: vi.fn(), addFromBlob: h.addFromBlob, addFromStock: h.addFromStock, addLifted: vi.fn(), busy: ref(false) }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ get isAiEnabled() { return h.ai; } }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "u" } }) }));
vi.mock("./canvas", () => ({ blobHasTransparency: vi.fn(async () => false), canvasLiftDeps: h.deps, loadImage: h.loadImage, redrawAsPng: vi.fn(async () => h.png) }));

vi.mock("./liftFlow", () => ({ runLift: h.runLift }));
vi.mock("@/lib/bookNook/upload", () => ({ uploadNookImage: vi.fn() }));

import AddCutoutDialog from "./AddCutoutDialog.vue";
import { EMPTY_SHELF } from "./costLabels";
import { newScene } from "@/lib/bookNook/edit";

const scene = newScene({ id: "n", title: "The Kettle Room", room: { url: "room", width: 2000, height: 1000 } });
const query = (data: unknown[] | undefined) => ({ data: ref(data), isPending: ref(false), isError: ref(false) });
const part = (id: string, group: string, name: string) => ({ id, kind: "cutout", group_key: group, name, image_url: `${id}.webp`, preset: { hold: "hangs", motion: "Cloth" }, sort_order: 0 });

const mountIt = () => mount(AddCutoutDialog, { props: { open: true, nookId: "n1", scene }, attachTo: document.body });
const button = (label: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(label));

beforeEach(() => {
  document.body.innerHTML = "";
  h.requireCredits.mockReset().mockReturnValue(true);
  h.addFromStock.mockClear();
  h.addFromBlob.mockClear();
  h.parts = query([]);
  h.ai = true;
});

describe("AddCutoutDialog", () => {
  it("says the shelf is being painted when it has no parts", () => {
    mountIt();
    expect(document.body.textContent).toContain(EMPTY_SHELF);
  });

  it("shows the shelf in its groups and adds a part on click", async () => {
    h.parts = query([part("a", "fire", "Torch flame"), part("b", "cloth", "Banner")]);
    mountIt();
    expect(document.body.textContent).toContain("Fire");
    expect(document.body.textContent).toContain("Cloth");
    (document.body.querySelector('[aria-label="Add Banner"]') as HTMLElement).click();
    await flushPromises();
    expect(h.addFromStock).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
  });

  it("prices Lift as two pictures and Paint as one on the buttons", () => {
    mountIt();
    expect(button("Lift · 6 credits")).toBeTruthy();
    expect(button("Paint · 3 credits")).toBeTruthy();
  });

  it("offers a campaign with AI off only the free ways in", async () => {
    // Bug: Lift, Paint and Remove background showed in a campaign that turned AI off, and called the model when pressed.
    h.ai = false;
    const w = mountIt();
    const input = document.body.querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["j"], "lamp.jpg", { type: "image/jpeg" })] });
    input.dispatchEvent(new Event("change"));
    await flushPromises();
    expect(button("Add it as it is")).toBeTruthy();
    expect(button("Remove background")).toBeUndefined();
    expect(button("Lift ·")).toBeUndefined();
    expect(button("Paint ·")).toBeUndefined();
    w.unmount();
  });

  it("spends nothing when the credit gate says no", async () => {
    // Bug: Paint calls the model before the credit check and a DM with no credits is charged or errors server-side.
    h.requireCredits.mockReturnValue(false);
    const w = mountIt();
    await w.vm.$nextTick();
    const ta = document.body.querySelector("textarea") as HTMLTextAreaElement;
    ta.value = "a brass lamp";
    ta.dispatchEvent(new Event("input"));
    await w.vm.$nextTick();
    button("Paint · 3 credits")!.click();
    await flushPromises();
    expect(h.requireCredits).toHaveBeenCalledWith(3);
    expect(h.paint).not.toHaveBeenCalled();
  });

  it("sends Remove background a PNG redrawn from the file, never the original JPEG", async () => {
    // Bug: the DM's JPEG/WebP went to the PNG-only function as it was and was refused.
    const w = mountIt();
    const input = document.body.querySelector('input[type=file]') as HTMLInputElement;
    const jpeg = new File(["j"], "lamp.jpg", { type: "image/jpeg" });
    Object.defineProperty(input, "files", { value: [jpeg] });
    input.dispatchEvent(new Event("change"));
    await flushPromises();
    button("Remove background")!.click();
    await flushPromises();
    expect(h.lift).toHaveBeenCalledWith("n1", h.png);
    w.unmount();
  });

  describe("Lift", () => {
    const brush = { data: new Uint8ClampedArray(4), width: 200, height: 100 };
    const lifted = async (hint: string | null) => {
      h.loadImage.mockResolvedValue({ naturalWidth: 200, naturalHeight: 100 } as never);
      const w = mount(AddCutoutDialog, { props: { open: true, nookId: "n1", scene }, attachTo: document.body, global: { stubs: { LiftTool: true } } });
      button("Lift · 6 credits")!.click();
      await flushPromises();
      w.findComponent({ name: "LiftTool" }).vm.$emit("lift", { brush, bounds: { x: 50, y: 20, w: 40, h: 40 }, hint });
      await flushPromises();
      return w;
    };

    it("sends the DM's words with the crop, and crops round the painted bounds", async () => {
      // Bug: the description never reached the model, or the crop came from the whole picture instead of the paint.
      const w = await lifted("the music box, not the table");
      h.lift.mockClear();
      const [deps, crop] = h.runLift.mock.calls[0] as unknown as [{ lift: (b: Blob) => unknown }, { x: number; w: number }];
      await deps.lift(h.png);
      expect(h.lift).toHaveBeenCalledWith("n1", h.png, "the music box, not the table");
      expect(h.deps).toHaveBeenCalledWith(expect.anything(), brush);
      expect(crop.x).toBeGreaterThan(40);
      expect(crop.w).toBeLessThan(60);
      w.unmount();
    });

    it("sends no hint at all when the words are blank", async () => {
      // Bug: a blank box went to the server as an empty subject.
      h.lift.mockClear();
      const w = await lifted(null);
      const [deps] = h.runLift.mock.calls.at(-1) as unknown as [{ lift: (b: Blob) => unknown }];
      await deps.lift(h.png);
      expect(h.lift).toHaveBeenCalledWith("n1", h.png, undefined);
      w.unmount();
    });
  });
});
