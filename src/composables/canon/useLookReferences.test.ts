import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";

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

  // Bug caught: a second add while one was uploading counted the same room and could write five URLs.
  it("does nothing when add is called while another add is running", async () => {
    let release: (u: string) => void = () => {};
    mocks.upload.mockReset();
    mocks.upload.mockImplementationOnce(() => new Promise<string>((r) => { release = r; }));
    const r = setup(["a", "b", "c"]);
    const first = r.add([png()]);
    await vi.waitFor(() => expect(r.busy.value).toBe(true));
    await r.add([png()]);
    expect(mocks.upload).toHaveBeenCalledOnce();
    release("https://cdn/x.webp");
    await first;
    expect(r.persist).toHaveBeenCalledOnce();
  });

  // Bug caught: a refetch between quick removals put a removed picture back, because only add() held the watch off.
  it("keeps the optimistic list when saved changes while a removal is being written", async () => {
    const saved = ref<string[]>(["a", "b", "c"]);
    let release: () => void = () => {};
    const persist = vi.fn((_urls: string[]) => new Promise<void>((r) => { release = r; }));
    const r = useLookReferences(() => saved.value, persist);
    const removing = r.remove("a");
    saved.value = ["a", "b", "c"];
    await nextTick();
    expect(r.images.value).toEqual(["b", "c"]);
    release();
    await removing;
  });
});
