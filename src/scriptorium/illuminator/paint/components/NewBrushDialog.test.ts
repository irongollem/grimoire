// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RgbaPixels } from "../brushes/tipFromImage";
import type { NewTip } from "../brushes/newTip";
import NewBrushDialog from "./NewBrushDialog.vue";

const store = reactive({ activeCampaignId: "camp-1" as string | null, isAiEnabled: true });
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => store }));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 50, affordable: () => true, balance: { value: 500 } }) }));
vi.mock("@/composables/ai/useProviderConfig", () => ({ useProviderConfig: () => ({ imageMultiplierFor: () => 1 }) }));
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ openOutOfCredits: vi.fn() }) }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } } }));

function dots(radii: number[]): RgbaPixels {
  const w = 100;
  const data = new Uint8ClampedArray(w * w * 4).fill(255);
  radii.forEach((r, i) => {
    const cx = (i % 2) * 50 + 25;
    const cy = Math.floor(i / 2) * 50 + 25;
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) data.set([10, 10, 10, 255], (y * w + x) * 4);
  });
  return { width: w, height: w, data };
}
const dotPhoto = (): RgbaPixels => {
  const w = 60;
  const data = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if ((x - 30) ** 2 + (y - 30) ** 2 <= 100) data.set([20, 20, 20, 255], (y * w + x) * 4);
  return { width: w, height: w, data };
};
const blankPhoto = (): RgbaPixels => ({ width: 40, height: 40, data: new Uint8ClampedArray(40 * 40 * 4).fill(255) });

const tipDeps = (radii = [10, 14, 18, 22]) => ({ fetchSheet: vi.fn(async () => "b64"), decode: vi.fn(async () => dots(radii)) });

function mountIt(props: Record<string, unknown> = {}) {
  return mount(NewBrushDialog, {
    props: { open: true, campaignId: "camp-1", decode: async () => dotPhoto(), ...props },
    attachTo: document.body,
    global: { stubs: { teleport: true, PaintPreviewCanvas: true, GenerationCostBadge: true } },
  });
}
async function pickFile(w: ReturnType<typeof mountIt>, name = "my-dab_1.png") {
  const input = w.get('[data-testid="way-photo-file"]');
  Object.defineProperty(input.element, "files", { value: [new File(["x"], name)], configurable: true });
  await input.trigger("change");
  await flushPromises();
}

/** What the dialog last handed up to be saved. */
function saved(w: ReturnType<typeof mountIt>): NewTip[] {
  const calls = w.emitted<[NewTip[]]>("save");
  if (!calls || calls.length === 0) throw new Error("nothing was saved");
  return calls[calls.length - 1][0];
}

beforeEach(() => {
  store.activeCampaignId = "camp-1";
  store.isAiEnabled = true;
});

describe("the ways", () => {
  it("offers Describe only when the book's campaign is the active one with AI on", () => {
    // Fails on: a paid way shown where AI is off, or for a book whose campaign is not the active one.
    expect(mountIt().find('[data-testid="way-describe"]').exists()).toBe(true);
    store.isAiEnabled = false;
    expect(mountIt().find('[data-testid="way-describe"]').exists()).toBe(false);
    store.isAiEnabled = true;
    expect(mountIt({ campaignId: "camp-2" }).find('[data-testid="way-describe"]').exists()).toBe(false);
    expect(mountIt({ campaignId: null }).find('[data-testid="way-describe"]').exists()).toBe(false);
  });

  it("hands From this brush and From a box up without making anything itself", async () => {
    // Fails on: either way saving a brush from inside the dialog, or the box way leaving the dialog open over the stage.
    const w = mountIt();
    await w.get('[data-testid="way-armed"]').trigger("click");
    await w.get('[data-testid="way-box"]').trigger("click");
    expect(w.emitted("from-armed")).toHaveLength(1);
    expect(w.emitted("start-box")).toHaveLength(1);
    expect(w.emitted("save")).toBeUndefined();
  });
});

describe("from a photo", () => {
  it("shows the tip with a name from the file and saves it as a photo brush", async () => {
    // Fails on: a photo brush saved with the wrong source, an empty name, or saved before the painter has seen it.
    const w = mountIt();
    await pickFile(w);
    expect(w.emitted("save")).toBeUndefined();
    expect((w.get('[data-testid="new-brush-name"]').element as HTMLInputElement).value).toBe("my dab 1");
    await w.get('[data-testid="new-brush-save"]').trigger("click");
    const items = saved(w);
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe("photo");
    expect(items[0].name).toBe("my dab 1");
    expect(items[0].tip.alpha.length).toBe(items[0].tip.width * items[0].tip.height);
  });

  it("says what is wrong with a photo that has no mark, and keeps the ways open", async () => {
    // Fails on: a blank photo making an empty brush, or the refusal never reaching the painter.
    const w = mountIt({ decode: async () => blankPhoto() });
    await pickFile(w);
    expect(w.get('[data-testid="new-brush-error"]').text()).toContain("No mark was found");
    expect(w.find('[data-testid="way-photo"]').exists()).toBe(true);
  });
});

describe("from a box", () => {
  it("opens on the cut tip, ready to name, and saves it as a picture brush", async () => {
    // Fails on: the boxed tip being lost on the way back from the stage, or saved with another source.
    const tip = { width: 2, height: 2, alpha: new Uint8Array([0, 255, 255, 0]) };
    const w = mountIt({ ready: { tip, name: "Brush from the picture", source: "picture" } });
    await w.get('[data-testid="new-brush-save"]').trigger("click");
    const items = saved(w);
    expect(items[0]).toMatchObject({ source: "picture", name: "Brush from the picture" });
  });
});

describe("describe it", () => {
  async function toPick(deps = tipDeps(), text = "a wet sponge dab") {
    const w = mountIt({ tipDeps: deps });
    await w.get('[data-testid="way-describe"]').trigger("click");
    await w.get('[data-testid="describe-input"]').setValue(text);
    await w.get('[data-testid="describe-make"]').trigger("click");
    await flushPromises();
    return w;
  }

  it("will not make until the description is 3 to 200 characters", async () => {
    // Fails on: a paid call that the function will refuse, or a button that is live for an empty box.
    const deps = tipDeps();
    const w = mountIt({ tipDeps: deps });
    await w.get('[data-testid="way-describe"]').trigger("click");
    const make = () => w.get('[data-testid="describe-make"]').attributes("disabled");
    expect(make()).toBeDefined();
    await w.get('[data-testid="describe-input"]').setValue("ab");
    expect(make()).toBeDefined();
    await w.get('[data-testid="describe-input"]').setValue("abc");
    expect(make()).toBeUndefined();
    await w.get('[data-testid="describe-input"]').setValue("a".repeat(201));
    expect(make()).toBeDefined();
    expect(deps.fetchSheet).not.toHaveBeenCalled();
  });

  it("shows four tips, all ticked, and saves each kept one named by number with the described source", async () => {
    // Fails on: unticking not dropping a tip, a wrong number in a name, or a described brush saved as another source.
    const w = await toPick();
    expect(w.findAll('[data-testid^="described-"]').filter((e) => /^described-\d$/.test(e.attributes("data-testid") ?? ""))).toHaveLength(4);
    await w.get('[data-testid="described-1"] input[type="checkbox"]').setValue(false);
    await w.get('[data-testid="described-save"]').trigger("click");
    const items = saved(w);
    expect(items.map((i) => i.name)).toEqual(["a wet sponge dab 1", "a wet sponge dab 3", "a wet sponge dab 4"]);
    expect(items.every((i) => i.source === "described")).toBe(true);
    expect(items[0].tip.width).toBeLessThan(items[2].tip.width);
  });

  it("cannot save with every tip unticked", async () => {
    // Fails on: a Save that hands up an empty list.
    const w = await toPick();
    for (let i = 0; i < 4; i++) await w.get(`[data-testid="described-${i}"] input[type="checkbox"]`).setValue(false);
    expect(w.get('[data-testid="described-save"]').attributes("disabled")).toBeDefined();
  });

  it("shows a refusal from the call and stays on the description", async () => {
    // Fails on: a failed call leaving the painter on a blank screen with no reason.
    const deps = { fetchSheet: vi.fn(async () => { throw new Error("AI features are switched off for this campaign."); }), decode: vi.fn() };
    const w = await toPick(deps);
    expect(w.get('[data-testid="describe-error"]').text()).toContain("switched off");
    expect(w.find('[data-testid="new-brush-pick"]').exists()).toBe(false);
  });
});
