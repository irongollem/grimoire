import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  contexts: [] as { dpi: number | null; destroyed: boolean }[],
  domToBlob: vi.fn<(ctx: { dpi: number | null }) => Promise<Blob>>(),
  download: vi.fn<(blob: Blob, name: string) => void>(),
  toastError: vi.fn<(message: string) => void>(),
}));

vi.mock("modern-screenshot", () => ({
  // The library's own rule: 96 dpi × scale, null at scale 1.
  createContext: async (_el: Element, opts: { scale: number }) => {
    const ctx = { dpi: opts.scale === 1 ? null : 96 * opts.scale, destroyed: false };
    h.contexts.push(ctx);
    return ctx;
  },
  destroyContext: (ctx: { destroyed: boolean }) => {
    ctx.destroyed = true;
  },
  domToBlob: h.domToBlob,
}));
vi.mock("@/lib/downloadBlob", () => ({ downloadBlob: h.download }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: h.toastError, fromError: (_e: unknown, fallback: string) => fallback }),
}));

import { useCardImageExport } from "./useCardImageExport";

function card(): HTMLElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "offsetWidth", { value: 200 });
  return el;
}

const request = (key = "npc1") => ({ key, element: card(), size: "mtg" as const, name: "Ashen Warden", face: "front" as const });

beforeEach(() => {
  h.contexts.length = 0;
  h.domToBlob.mockReset();
  h.download.mockReset();
  h.toastError.mockReset();
  Object.defineProperty(document, "fonts", { value: { ready: Promise.resolve() }, configurable: true });
});

describe("useCardImageExport (#1141)", () => {
  it("stamps 300 dpi, not the library's 96 × scale, so the card prints at 63 mm", async () => {
    h.domToBlob.mockImplementation(async (ctx) => {
      expect(ctx.dpi).toBe(300);
      return new Blob();
    });
    await useCardImageExport().saveCardImage(request());
    expect(h.domToBlob).toHaveBeenCalledOnce();
    expect(h.download.mock.calls[0]?.[1]).toBe("Ashen_Warden_card_front.png");
  });

  it("a failed render tells the DM, frees the button and the render context", async () => {
    h.domToBlob.mockRejectedValue(new Error("boom"));
    const { savingKey, saveCardImage } = useCardImageExport();
    await saveCardImage(request());
    expect(h.toastError).toHaveBeenCalledOnce();
    expect(h.download).not.toHaveBeenCalled();
    expect(savingKey.value).toBeNull();
    expect(h.contexts[0]?.destroyed).toBe(true);
  });

  it("ignores a second save while one is running", async () => {
    let finish!: (b: Blob) => void;
    h.domToBlob.mockImplementation(() => new Promise<Blob>((r) => (finish = r)));
    const { savingKey, saveCardImage } = useCardImageExport();
    const first = saveCardImage(request("npc1"));
    await vi.waitFor(() => expect(h.domToBlob).toHaveBeenCalledOnce());
    await saveCardImage(request("npc2"));
    expect(savingKey.value).toBe("npc1");
    finish(new Blob());
    await first;
    expect(h.domToBlob).toHaveBeenCalledOnce();
    expect(savingKey.value).toBeNull();
  });
});
