import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HandoutPinUp from "./HandoutPinUp.vue";

const mocks = vi.hoisted(() => ({ createPin: vi.fn(), toastSuccess: vi.fn() }));

const boards = [
  { id: "b1", campaign_id: "c1", name: "The Kettle and Crumb", surface: "cork", scatter: [], is_revealed: true },
  { id: "b2", campaign_id: "c1", name: "Bell Square board", surface: "planks", scatter: [], is_revealed: false },
];
vi.mock("@/composables/noticeBoards/useNoticeBoards", () => ({
  useNoticeBoards: () => ({ data: ref(boards), isLoading: ref(false) }),
  useCampaignNoticeBoardPins: () => ({ data: ref([]) }),
  useCreateNoticeBoardPin: () => ({ mutateAsync: mocks.createPin, isPending: ref(false) }),
}));
vi.mock("@/composables/locations/useLocationPlacements", () => ({
  useEntityPlacementsFor: () => ({ data: ref([{ notice_board_id: "b1", location: { id: "l1", name: "the inn" } }]) }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ success: mocks.toastSuccess }) }));

const handout = {
  id: "h1",
  title: "A Letter from the Bell-Mother",
  campaign_id: "c1",
  player_visible_to: [] as string[],
  updated_at: "2026-10-04T10:00:00Z",
  theme: "letter" as const,
};

function mountPin(theme: "letter" | "onednd2024" = "letter") {
  return mount(HandoutPinUp, {
    props: { handout: { ...handout, theme } },
    global: { stubs: { NoticeBoardSurface: { template: "<div><slot /></div>" }, NoticeBoardPin: { props: ["face"], template: '<i data-face>{{ face.style }}:{{ face.headline }}</i>' }, RouterLink: true } },
  });
}

const pinButton = (w: ReturnType<typeof mountPin>) => w.findAll("button").find((b) => b.text().includes("Pin it up"))!;

describe("HandoutPinUp", () => {
  beforeEach(() => {
    mocks.createPin.mockReset().mockResolvedValue({});
    mocks.toastSuccess.mockReset();
  });

  it("lists the campaign's boards with where they hang and who can see them", () => {
    const text = mountPin().text();
    expect(text).toContain("The Kettle and Crumb");
    expect(text).toContain("Hangs at the inn · shown to players");
    expect(text).toContain("Not hung anywhere yet · hidden");
  });

  it("pins THIS handout on the chosen board, on the paper's pin style, with the front line the DM left", async () => {
    const w = mountPin();
    await w.findAll('input[type="radio"]')[1].setValue(true);
    await pinButton(w).trigger("click");
    await flushPromises();
    expect(mocks.createPin).toHaveBeenCalledTimes(1);
    expect(mocks.createPin.mock.calls[0][0]).toMatchObject({
      board_id: "b2",
      handout_id: "h1",
      style: "letter",
      headline: "A Letter from the Bell-Mother",
      status: "up",
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Pinned on Bell Square board.");
    expect(w.emitted("close")).toBeTruthy();
  });

  it("pins a book look as a note", async () => {
    const w = mountPin("onednd2024");
    await pinButton(w).trigger("click");
    await flushPromises();
    expect(mocks.createPin.mock.calls[0][0]).toMatchObject({ style: "note", seal: null });
  });

  it("writes the front line the DM typed, and draws it in the preview", async () => {
    const w = mountPin();
    await w.get("input[type=text], input:not([type])").setValue("To whoever keeps the hours");
    expect(w.get("[data-face]:last-of-type").text()).toBe("letter:To whoever keeps the hours");
    await pinButton(w).trigger("click");
    await flushPromises();
    expect(mocks.createPin.mock.calls[0][0].headline).toBe("To whoever keeps the hours");
  });

  it("will not pin a notice with nothing on the front", async () => {
    const w = mountPin();
    await w.get("input:not([type=radio])").setValue("   ");
    expect(pinButton(w).attributes("disabled")).toBeDefined();
    await pinButton(w).trigger("click");
    expect(mocks.createPin).not.toHaveBeenCalled();
  });

  it("shows why pinning failed and stays open", async () => {
    mocks.createPin.mockRejectedValue(new Error("Board is gone"));
    const w = mountPin();
    await pinButton(w).trigger("click");
    await flushPromises();
    expect(w.text()).toContain("Board is gone");
    expect(w.emitted("close")).toBeUndefined();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});
