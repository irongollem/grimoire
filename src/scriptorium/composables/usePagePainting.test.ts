// @vitest-environment happy-dom
import { effectScope, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PageFurnitureItem } from "@/scriptorium/types";

const canCreate = ref(true);
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate }) }));
const toastError = vi.fn();
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: toastError }) }));
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: vi.fn() }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "u1" } }) }));
const upload = vi.hoisted(() => vi.fn());
vi.mock("@/scriptorium/lib/panel/newSheetUpload", () => ({ uploadTransparentSheet: upload }));

import { usePagePainting } from "./usePagePainting";

const item = { id: "art1", kind: "art", props: { src: "https://cdn/s.webp" } } as unknown as PageFurnitureItem;

function setup() {
  const addArt = vi.fn().mockReturnValue(item);
  const open = vi.fn();
  const api = effectScope().run(() => usePagePainting({ pictures: () => ({ addArt }), pageAspect: () => 0.7, paperTone: () => "kraft", theme: () => "grimoire", open }));
  if (!api) throw new Error("no api");
  return { api, addArt, open };
}

beforeEach(() => {
  canCreate.value = true;
  upload.mockReset().mockResolvedValue("https://cdn/s.webp");
  toastError.mockReset();
});

describe("usePagePainting", () => {
  // Fails on: a Free account with its canvas already used getting a stored file and a second canvas.
  it("asks the free plan's canvas quota first: over it, nothing is stored and the upgrade prompt shows", async () => {
    canCreate.value = false;
    const { api, addArt, open } = setup();
    await api.start();
    expect(upload).not.toHaveBeenCalled();
    expect(addArt).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(api.showPaywall.value).toBe(true);
  });

  // Fails on: the painting landing in front of the text, not filling the page, or the Illuminator not opening on it.
  it("stores a transparent page-sized sheet, adds it full bleed behind the text on the book's paper and opens it", async () => {
    const { api, addArt, open } = setup();
    await api.start();
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }), "u1");
    const [src, props, placement] = addArt.mock.calls[0] as [string, Record<string, unknown>, { z: string }];
    expect(src).toBe("https://cdn/s.webp");
    expect(props).toMatchObject({ original: "https://cdn/s.webp", fill: "page", blend: "paper", painting: 1 });
    expect(props.illuminate).toMatchObject({ steps: [{ type: "paint", paper: "kraft", layers: [] }] });
    expect(placement.z).toBe("under");
    expect(open).toHaveBeenCalledWith(item);
    expect(api.showPaywall.value).toBe(false);
  });

  // Fails on: a failed upload leaving an empty item on the page, or a silent failure.
  // Fails on: a double click starting two uploads and two canvases while the first sheet is still uploading.
  it("starts one painting however often it is asked while one is being made", async () => {
    let finish: (url: string) => void = () => undefined;
    upload.mockReset().mockReturnValue(new Promise<string>((resolve) => { finish = resolve; }));
    const { api, addArt } = setup();
    const first = api.start();
    await api.start();
    expect(api.busy.value).toBe(true);
    finish("https://cdn/s.webp");
    await first;
    expect(upload).toHaveBeenCalledTimes(1);
    expect(addArt).toHaveBeenCalledTimes(1);
    expect(api.busy.value).toBe(false);
  });

  it("adds nothing and says so when the file cannot be stored", async () => {
    upload.mockRejectedValue(new Error("Storage is down."));
    const { api, addArt, open } = setup();
    await api.start();
    expect(addArt).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("Storage is down.");
    expect(api.busy.value).toBe(false);
  });
});
