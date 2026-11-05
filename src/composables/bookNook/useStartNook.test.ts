// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  push: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  show: vi.fn(),
  upload: vi.fn(),
  generate: vi.fn(),
  require: vi.fn(),
}));

vi.mock("vue-router", () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/composables/bookNook/useBookNooks", () => ({
  BOOK_NOOKS_KEY: "book-nooks",
  useCreateBookNook: () => ({ mutateAsync: m.create }),
  saveBookNook: m.save,
  deleteBookNook: m.remove,
}));
vi.mock("@/composables/bookNook/useShowNookAtPlace", () => ({ useShowNookAtPlace: () => ({ mutateAsync: m.show }) }));
vi.mock("@/lib/bookNook/upload", () => ({ uploadNookImage: m.upload }));
vi.mock("@/lib/supabase", () => ({ getCurrentUser: () => ({ id: "dm-1" }) }));
vi.mock("@/ai/useImageGeneration", () => ({
  captureImageGenerationContext: () => ({ campaignId: "c1" }),
  generateImage: m.generate,
}));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 4 }) }));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({ imageCredits: (n: number) => n * 2, imageIsByok: { value: false } }),
}));
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ requireCredits: m.require }) }));

import { useStartNook } from "./useStartNook";

class FakeImage {
  naturalWidth = 1600;
  naturalHeight = 900;
  onload: () => void = () => {};
  onerror: () => void = () => {};
  set src(_: string) {
    queueMicrotask(() => this.onload());
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("Image", FakeImage);
  URL.createObjectURL = vi.fn(() => "blob:local");
  URL.revokeObjectURL = vi.fn();
  m.create.mockResolvedValue({ id: "n1", rev: 1 });
  m.require.mockReturnValue(true);
  m.upload.mockResolvedValue("https://cdn.example.invalid/room.webp");
});

const place = { id: "p1", name: "The Gilded Stag", image_url: "https://cdn.example.invalid/stag.webp" };

describe("startFromPicture", () => {
  it("shows the new nook at the place and opens its studio", async () => {
    const id = await useStartNook().startFromPicture(place);
    expect(id).toBe("n1");
    expect(m.create.mock.calls[0][0]).toMatchObject({ title: "The Gilded Stag", still_url: place.image_url });
    expect(m.show).toHaveBeenCalledWith({ locationId: "p1", nookId: "n1" });
    expect(m.push).toHaveBeenCalledWith({ name: "book-nook-studio", params: { id: "n1" } });
  });

  it("sizes the room by the picture, not by a guess", async () => {
    await useStartNook().startFromPicture(place);
    expect(m.create.mock.calls[0][0].scene.size).toEqual({ width: 1600, height: 900 });
  });

  it("refuses a place with no picture and makes nothing", async () => {
    const start = useStartNook();
    expect(await start.startFromPicture({ ...place, image_url: null })).toBeNull();
    expect(m.create).not.toHaveBeenCalled();
    expect(start.error.value).toMatch(/no picture/);
  });
});

describe("startFromUpload", () => {
  const file = new File(["x"], "room.png", { type: "image/png" });

  it("uploads under the new nook's id, saves the scene against the row's revision and opens the studio", async () => {
    await useStartNook().startFromUpload(file, "Cellar");
    expect(m.upload).toHaveBeenCalledWith(file, "n1", "dm-1");
    expect(m.save).toHaveBeenCalledWith("n1", 1, expect.objectContaining({ still_url: "https://cdn.example.invalid/room.webp" }));
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.push).toHaveBeenCalledWith({ name: "book-nook-studio", params: { id: "n1" } });
  });

  it("deletes the half-made row when the upload fails, and does not open the studio", async () => {
    m.upload.mockRejectedValue(new Error("storage down"));
    const start = useStartNook();
    expect(await start.startFromUpload(file, "Cellar")).toBeNull();
    expect(m.remove).toHaveBeenCalledWith("n1");
    expect(m.push).not.toHaveBeenCalled();
    expect(start.error.value).toBe("storage down");
  });
});

describe("startFromPainted", () => {
  it("spends nothing and makes nothing when the DM is out of credits", async () => {
    m.require.mockReturnValue(false);
    expect(await useStartNook().startFromPainted(null, "a cellar")).toBeNull();
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });

  it("asks for a wide room empty of people and of moving things, then shows it at the place", async () => {
    m.generate.mockResolvedValue("https://cdn.example.invalid/painted.webp");
    await useStartNook().startFromPainted(place, "a tavern common room");
    const request = m.generate.mock.calls[0][0];
    expect(request).toMatchObject({ purpose: "location", size: "1536x1024" });
    expect(request.subject).toMatch(/a tavern common room/);
    expect(request.subject).toMatch(/No people/);
    expect(m.show).toHaveBeenCalledWith({ locationId: "p1", nookId: "n1" });
  });

  it("shows the cost on the campaign's image provider", () => {
    expect(useStartNook().paintCost.value).toBe(8);
  });
});
