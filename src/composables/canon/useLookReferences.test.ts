import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({
  ack: vi.fn(),
  upload: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("@/composables/ai/useLikenessGate", () => ({ useLikenessGate: () => ({ ensureLikenessAck: mocks.ack }) }));
vi.mock("@/lib/storage", () => ({ uploadToBucket: mocks.upload }));
vi.mock("@/lib/mediaConvert", () => ({ toWebP: async (f: File) => f }));
vi.mock("@/lib/supabase", () => ({ getCurrentUser: () => ({ id: "u1" }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: mocks.toastError }) }));

import { useLookReferences } from "./useLookReferences";

const png = () => new File(["x"], "a.png", { type: "image/png" });

function setup(initial: string[] = []) {
  const saved = ref<string[]>(initial);
  const persist = vi.fn(async (_urls: string[]) => {});
  return { persist, ...useLookReferences(() => saved.value, persist) };
}

describe("useLookReferences", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.ack.mockResolvedValue(true);
    let n = 0;
    mocks.upload.mockImplementation(async () => `https://cdn/p${++n}.webp`);
  });

  it("refuses a fifth picture and uploads nothing, so the table's limit of four is never hit by a write", async () => {
    const r = setup(["a", "b", "c", "d"]);
    await r.add([png()]);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(r.persist).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledOnce();
  });

  it("refuses a batch that would pass four rather than saving part of it", async () => {
    const r = setup(["a", "b", "c"]);
    await r.add([png(), png()]);
    expect(r.persist).not.toHaveBeenCalled();
    expect(r.images.value).toEqual(["a", "b", "c"]);
  });

  it("uploads nothing when the likeness notice is declined, and says nothing", async () => {
    mocks.ack.mockResolvedValue(false);
    const r = setup();
    await r.add([png()]);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("ignores files that are not pictures, so a PDF dropped on the tile is not uploaded", async () => {
    const r = setup();
    await r.add([new File(["x"], "a.pdf", { type: "application/pdf" })]);
    expect(mocks.ack).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("saves added pictures after the existing ones, under the user's folder", async () => {
    const r = setup(["old"]);
    await r.add([png(), png()]);
    expect(r.persist).toHaveBeenCalledWith(["old", "https://cdn/p1.webp", "https://cdn/p2.webp"]);
    expect(mocks.upload.mock.calls[0][0].path).toMatch(/^u1\/look-.+\.webp$/);
  });

  it("puts the list back and tells the DM when saving fails", async () => {
    const r = setup(["a"]);
    r.persist.mockRejectedValueOnce(new Error("nope"));
    await r.remove("a");
    expect(r.images.value).toEqual(["a"]);
    expect(mocks.toastError).toHaveBeenCalledWith("nope");
  });

  it("removes one picture and keeps the others", async () => {
    const r = setup(["a", "b", "c"]);
    await r.remove("b");
    expect(r.persist).toHaveBeenCalledWith(["a", "c"]);
  });
});
