// @vitest-environment happy-dom
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RgbaPixels } from "./brushes/tipFromImage";
import { checkDescription, readableRefusal, tipsFromSheet, useDescribedTips, type DescribedTipsDeps } from "./useDescribedTips";

const store = reactive({ activeCampaignId: "camp-1" as string | null, isAiEnabled: true });
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => store }));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 50 }) }));
vi.mock("@/composables/ai/useProviderConfig", () => ({ useProviderConfig: () => ({ imageMultiplierFor: () => 1 }) }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } } }));

/** A 2x2 sheet, 100 px a side, white, with a dark dot of a different size in each quarter. */
function sheet(radii: [number, number, number, number] = [10, 14, 18, 22]): RgbaPixels {
  const w = 100;
  const data = new Uint8ClampedArray(w * w * 4).fill(255);
  radii.forEach((r, i) => {
    const cx = (i % 2) * 50 + 25;
    const cy = Math.floor(i / 2) * 50 + 25;
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) data.set([10, 10, 10, 255], (y * w + x) * 4);
      }
    }
  });
  return { width: w, height: w, data };
}

const fakeDeps = (pixels: RgbaPixels = sheet()) => ({
  fetchSheet: vi.fn(async () => "b64"),
  decode: vi.fn(async () => pixels),
}) satisfies DescribedTipsDeps;

beforeEach(() => {
  store.activeCampaignId = "camp-1";
  store.isAiEnabled = true;
});

describe("the description's length", () => {
  it("is held to 3 to 200 characters after trimming, on the client, before any call", async () => {
    // Fails on: a two-letter or 201-character description costing a call the server will refuse, or spaces counting as letters.
    expect(checkDescription("ab").ok).toBe(false);
    expect(checkDescription("   ab   ").ok).toBe(false);
    expect(checkDescription("abc").ok).toBe(true);
    expect(checkDescription("a".repeat(200)).ok).toBe(true);
    expect(checkDescription("a".repeat(201)).ok).toBe(false);
    const deps = fakeDeps();
    const d = useDescribedTips(deps);
    expect(await d.describe("hi", "camp-1")).toBeNull();
    expect(deps.fetchSheet).not.toHaveBeenCalled();
    expect(d.error.value).toContain("3 to 200");
  });
});

describe("the four quadrants", () => {
  it("each make their own tip, in order, from their own quarter of the sheet", () => {
    // Fails on: one quadrant read four times, or the quarters shuffled, so the four brushes would be the same mark.
    const tips = tipsFromSheet(sheet());
    const sizes = tips.map((t) => (t.ok ? t.tip.width : -1));
    expect(sizes.every((n) => n > 0)).toBe(true);
    expect(sizes[0]).toBeLessThan(sizes[1]);
    expect(sizes[1]).toBeLessThan(sizes[2]);
    expect(sizes[2]).toBeLessThan(sizes[3]);
  });

  it("keeps the good marks when one quarter is blank, and says nothing was made when all are", async () => {
    // Fails on: one empty quarter throwing the whole sheet away (the painter paid for it), or four blanks passing as a result.
    const d = useDescribedTips(fakeDeps(sheet([10, 0, 18, 22])));
    const tips = await d.describe("a dab", "camp-1");
    expect(tips?.map((t) => t.ok)).toEqual([true, false, true, true]);
    const blank = useDescribedTips(fakeDeps(sheet([0, 0, 0, 0])));
    expect(await blank.describe("a dab", "camp-1")).toBeNull();
    expect(blank.error.value).toContain("None of the four");
  });
});

describe("who may ask", () => {
  it("makes no call for another campaign than the active one, or with AI off", async () => {
    // Fails on: a paid call for a book whose campaign is not the active one, or in a campaign with AI switched off.
    const deps = fakeDeps();
    const d = useDescribedTips(deps);
    expect(await d.describe("a dab", "camp-2")).toBeNull();
    store.isAiEnabled = false;
    expect(await d.describe("a dab", "camp-1")).toBeNull();
    expect(deps.fetchSheet).not.toHaveBeenCalled();
    expect(d.error.value).toContain("switched off");
  });

  it("sends the trimmed description with the campaign, and shows a refusal as a sentence", async () => {
    // Fails on: the untrimmed words going up, or the raw code "ai_disabled" shown to the painter.
    const deps = fakeDeps();
    await useDescribedTips(deps).describe("  a dab  ", "camp-1");
    expect(deps.fetchSheet).toHaveBeenCalledWith("camp-1", "a dab");
    expect(readableRefusal("ai_disabled")).toContain("switched off");
    expect(readableRefusal("forbidden")).toContain("DM");
    expect(readableRefusal("Insufficient credits (3 left).")).toBe("Insufficient credits (3 left).");
    const failing = useDescribedTips({ fetchSheet: async () => { throw new Error("Insufficient credits (3 left)."); }, decode: async () => sheet() });
    expect(await failing.describe("a dab", "camp-1")).toBeNull();
    expect(failing.error.value).toBe("Insufficient credits (3 left).");
    expect(failing.busy.value).toBe(false);
  });
});
