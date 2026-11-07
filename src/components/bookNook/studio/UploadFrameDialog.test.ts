// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ upload: vi.fn(), clearMiddle: true }));

vi.mock("@/lib/bookNook/upload", () => ({ uploadNookFrame: h.upload }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "u1" } }) }));
vi.mock("./addCutout/canvas", () => ({ loadImage: vi.fn(async () => ({ naturalWidth: 100, naturalHeight: 100 })) }));

import UploadFrameDialog from "./UploadFrameDialog.vue";

function pick(w: ReturnType<typeof mountIt>, label: string, file: File) {
  const input = w.get(`input[aria-label="${label}"]`);
  Object.defineProperty(input.element, "files", { value: [file], configurable: true });
  return input.trigger("change");
}
const mountIt = () => mount(UploadFrameDialog, { props: { open: true }, global: { stubs: { teleport: true } } });

beforeEach(() => {
  vi.resetAllMocks();
  h.clearMiddle = true;
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  h.upload.mockImplementation(async (_b: Blob) => `https://cdn.example.invalid/${Math.random()}.webp`);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      ({
        drawImage: () => undefined,
        // A ring of opaque pixels round a clear middle, or an opaque picture when `clearMiddle` is off.
        getImageData: (_x: number, _y: number, w: number, hh: number) => {
          const data = new Uint8ClampedArray(w * hh * 4).fill(255);
          if (h.clearMiddle) for (let i = 0; i < w * hh; i++) data[i * 4 + 3] = (i % w) < w * 0.2 ? 255 : 0;
          return { data };
        },
      }) as unknown as CanvasRenderingContext2D,
  );
});

describe("UploadFrameDialog", () => {
  // Bug: an opaque picture accepted as a frame covers the whole room.
  it("refuses a picture with no see-through middle, in its own slot", async () => {
    h.clearMiddle = false;
    const w = mountIt();
    await pick(w, "Wide frame picture", new File(["x"], "ivy.png", { type: "image/png" }));
    await flushPromises();
    expect(w.text()).toContain("no see-through middle");
    const use = w.findAll("button").find((b) => b.text() === "Use this frame");
    expect(use?.attributes("disabled")).toBeDefined();
  });

  // Bug: the pair was applied with the picture's temporary URL, or without the chosen name.
  it("uploads the chosen shapes and emits the pair with a name from the file", async () => {
    const w = mountIt();
    await pick(w, "Wide frame picture", new File(["x"], "ivy.png", { type: "image/png" }));
    await flushPromises();
    await w.findAll("button").find((b) => b.text() === "Use this frame")!.trigger("click");
    await flushPromises();
    expect(h.upload).toHaveBeenCalledTimes(1);
    const [picked] = w.emitted("picked")![0] as [{ style: string; name: string; tall?: string; wide?: string }];
    expect(picked.name).toBe("ivy");
    expect(picked.style).toMatch(/^own-/);
    expect(picked.wide).toMatch(/^https:/);
    expect(picked.tall).toBeUndefined();
  });
});
