// @vitest-environment jsdom
import { flushPromises, mount, config } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NoticePinEditor from "./NoticePinEditor.vue";
import { grellRow, letterRow, pinRow } from "./pinRows";
import { focalImageStub } from "../fixtures";

// FocalImage measures with a ResizeObserver the test DOM lacks.
config.global.stubs = { ...config.global.stubs, FocalImage: focalImageStub };

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  backUp: vi.fn(),
  del: vi.fn(),
  confirm: vi.fn(),
  upload: vi.fn(),
  sweep: vi.fn(),
  bucket: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({ deleteUnreferencedByPublicUrl: mocks.sweep }));

vi.mock("@/composables/noticeBoards/useNoticeBoards", () => ({
  useUpdateNoticeBoardPin: () => ({ mutateAsync: mocks.update, isPending: ref(false) }),
  usePinNoticeBackUp: () => ({ mutateAsync: mocks.backUp, isPending: ref(false) }),
  useDeleteNoticeBoardPin: () => ({ mutateAsync: mocks.del, isPending: ref(false) }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useImageUpload", () => ({
  useImageUpload: (bucket: string) => {
    mocks.bucket(bucket);
    return { upload: mocks.upload, isUploading: ref(false), uploadError: ref(null) };
  },
}));
// The pickers read whole-campaign lists; the editor's own behaviour is what is under test.
vi.mock("./NoticePinOffers.vue", () => ({ default: { template: "<div data-offers />" } }));
vi.mock("./NoticePinSubjectPicker.vue", () => ({ default: { template: "<div data-subject />" } }));

const mountEditor = (pin = pinRow({ status: "draft" })) =>
  mount(NoticePinEditor, { props: { pin }, global: { directives: { "no-pwm": {} }, stubs: { Teleport: true } } });
const find = (w: ReturnType<typeof mountEditor>, text: string) => w.findAll("button").find((b) => b.text() === text);

describe("NoticePinEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue({ updated_at: "2026-10-16T11:00:00Z" });
    mocks.backUp.mockResolvedValue({});
    mocks.confirm.mockResolvedValue(true);
    mocks.sweep.mockResolvedValue(undefined);
  });

  it("uploads into the Dungeon Craft bucket, not the Scriptorium's", () => {
    mountEditor(grellRow());
    expect(mocks.bucket).toHaveBeenCalledWith("dungeon-feature-images");
  });

  it("shows the thumbnail of a portrait from another bucket", () => {
    const w = mountEditor(grellRow({ image_url: "https://cdn.example.invalid/npc-portraits/u/grell.webp" }));
    expect(w.get("img.h-16").attributes("src")).toBe("https://cdn.example.invalid/npc-portraits/u/grell.webp");
  });

  describe("pictures left behind", () => {
    const OLD = "https://cdn.example.invalid/dungeon-feature-images/u/old.webp";
    const NEW = "https://cdn.example.invalid/dungeon-feature-images/u/new.webp";
    const posterWith = () => mountEditor(grellRow({ image_url: OLD, status: "draft" }));

    it("sweeps the old file once a replacement has saved, never before", async () => {
      mocks.upload.mockResolvedValue(NEW);
      const w = posterWith();
      const input = w.get('input[type="file"]');
      Object.defineProperty(input.element, "files", { value: [new File(["x"], "n.png")], configurable: true });
      await input.trigger("change");
      await flushPromises();
      expect(mocks.sweep).not.toHaveBeenCalled();
      await find(w, "Put it up")?.trigger("click");
      await flushPromises();
      expect(mocks.sweep).toHaveBeenCalledWith({ urls: [OLD] });
    });

    it("sweeps the file when the picture is removed and saved", async () => {
      const w = posterWith();
      await find(w, "Remove picture")?.trigger("click");
      await find(w, "Put it up")?.trigger("click");
      await flushPromises();
      expect(mocks.update).toHaveBeenCalledWith({ id: "pin-grell", update: expect.objectContaining({ image_url: null }) });
      expect(mocks.sweep).toHaveBeenCalledWith({ urls: [OLD] });
    });

    it("sweeps an upload that was replaced before it ever saved", async () => {
      mocks.upload.mockResolvedValueOnce(NEW).mockResolvedValueOnce("https://cdn.example.invalid/dungeon-feature-images/u/newer.webp");
      const w = posterWith();
      const input = w.get('input[type="file"]');
      Object.defineProperty(input.element, "files", { value: [new File(["x"], "n.png")], configurable: true });
      await input.trigger("change");
      await flushPromises();
      await input.trigger("change");
      await flushPromises();
      expect(mocks.sweep).toHaveBeenCalledWith({ urls: [NEW] });
    });
  });

  it("previews the face as the reader will see it", () => {
    const w = mountEditor(grellRow());
    const preview = w.get("[data-pin-preview]");
    expect(preview.text()).toContain("Grell Ashmantle");
    expect(preview.text()).toContain("Wanted for the burning of the miller's barn");
    expect(preview.text()).toContain("Reward: 50 gold crowns, paid at the reeve's hall");
  });

  it("shows the reward and the picture picker for a poster, and neither for a note", () => {
    const poster = mountEditor(grellRow());
    expect(poster.text()).toContain("Reward");
    expect(poster.find("[data-subject]").exists()).toBe(true);
    const note = mountEditor(pinRow());
    expect(note.text()).not.toContain("Reward");
    expect(note.find("[data-subject]").exists()).toBe(false);
  });

  it("offers the seal choice for a letter", () => {
    expect(mountEditor(letterRow()).text()).toContain("Wax seal");
    expect(mountEditor(pinRow()).text()).not.toContain("Wax seal");
  });

  it("will not put up a notice with nothing on it", () => {
    const w = mountEditor(pinRow({ status: "draft", headline: null, body: null }));
    expect(find(w, "Put it up")?.attributes("disabled")).toBeDefined();
  });

  it("puts a draft up once saved", async () => {
    const w = mountEditor(pinRow({ status: "draft" }));
    await find(w, "Put it up")?.trigger("click");
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({ id: "pin-goat", update: { status: "up" } });
  });

  it("takes a pin on the board back to drafts", async () => {
    const w = mountEditor(pinRow({ status: "up" }));
    await find(w, "Take down")?.trigger("click");
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({ id: "pin-goat", update: { status: "draft" } });
  });

  it("pins a taken notice back up and names who took it", async () => {
    const w = mountEditor(pinRow({ status: "taken", taken_by: "m1", taken_at: "2026-10-16T20:00:00Z", taken_session_number: 12 }));
    expect(w.text()).toContain("nothing it revealed is undone");
    await find(w, "Pin back up")?.trigger("click");
    await flushPromises();
    expect(mocks.backUp).toHaveBeenCalledWith("pin-goat");
  });

  it("deletes only after confirming, then says so", async () => {
    const w = mountEditor();
    mocks.confirm.mockResolvedValueOnce(false);
    await find(w, "Delete")?.trigger("click");
    await flushPromises();
    expect(mocks.del).not.toHaveBeenCalled();

    await find(w, "Delete")?.trigger("click");
    await flushPromises();
    expect(mocks.del).toHaveBeenCalledWith("pin-goat");
    expect(w.emitted("deleted")).toHaveLength(1);
  });
});
