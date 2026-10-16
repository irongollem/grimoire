import { flushPromises, mount } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlayerNoticeBoard from "./PlayerNoticeBoard.vue";
import { board, grellPoster, goatNote, pin, ratsStub } from "./fixtures";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  take: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/composables/noticeBoards/usePlayerNoticeBoards", () => ({
  useTakeNoticePin: () => ({ mutateAsync: mocks.take, isPending: ref(false) }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: mocks.success, info: mocks.info, error: mocks.error, fromError: (e: Error) => e.message }),
}));

// The viewport and reader have their own tests; here they are a button per pin and a reader that shows its slot.
const stubs = {
  NoticeBoardViewport: {
    props: ["pins", "surface", "selectedId"],
    emits: ["select"],
    template: `<div><button v-for="p in pins" :key="p.id" :data-pin-id="p.id" @click="$emit('select', p.id, $el)">{{ p.headline }}</button></div>`,
  },
  NoticePinReader: {
    props: ["open", "face"],
    emits: ["close"],
    template: `<section v-if="open" data-reader>{{ face.headline }}<slot name="actions" /></section>`,
  },
};

async function mountBoard(props: Parameters<typeof board>[0] = {}) {
  const w = mount(PlayerNoticeBoard, { props: { board: board(props) }, global: { stubs } });
  await w.get('[data-pin-id="pin-grell"]').trigger("click");
  return w;
}

describe("PlayerNoticeBoard take flow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads a pin but cannot take it while the board is not presented", async () => {
    const w = await mountBoard();
    expect(w.get("[data-reader]").text()).toContain("Grell Ashmantle");
    expect(w.get("[data-take-hint]").text()).toBe("Taking a notice happens at the table, when your DM brings the party to the board.");
    expect(w.findComponent({ name: "AppButton" }).props("disabled")).toBe(true);
  });

  it("offers no Take on a note that offers nothing", async () => {
    const w = await mountBoard();
    await w.get('[data-pin-id="pin-goat"]').trigger("click");
    expect(w.text()).toContain("LOST: one goat");
    expect(w.text()).not.toContain("Take this notice");
  });

  it("takes while presented: toast, quest action and the handout opens", async () => {
    mocks.take.mockResolvedValue({ outcome: "taken", taken_by_name: "Aria", quest_id: "q-grell", handout_id: "h-grell" });
    const w = await mountBoard({ presented_at: "2026-10-15T20:00:00Z" });
    const btn = w.findComponent({ name: "AppButton" });
    expect(btn.props("disabled")).toBe(false);
    await btn.trigger("click");
    await flushPromises();
    expect(mocks.take).toHaveBeenCalledWith("pin-grell");
    expect(mocks.success).toHaveBeenCalledWith(
      "You took the wanted poster for Grell Ashmantle. It is in your quest log.",
      undefined,
      expect.objectContaining({ action: expect.objectContaining({ label: "Open quest" }) }),
    );
    expect(mocks.push).toHaveBeenCalledWith({ name: "play-handout", params: { id: "h-grell" } });
    expect(w.find("[data-reader]").exists()).toBe(false);
    mocks.success.mock.calls[0][2].action.run();
    expect(mocks.push).toHaveBeenCalledWith({ name: "play-quest-detail", params: { id: "q-grell" } });
  });

  it("losing a race is not an error: names the winner and still opens the handout", async () => {
    mocks.take.mockResolvedValue({ outcome: "already_taken", taken_by_name: "Chicory", quest_id: "q-grell", handout_id: "h-grell" });
    const w = await mountBoard({ presented_at: "2026-10-15T20:00:00Z" });
    await w.findComponent({ name: "AppButton" }).trigger("click");
    await flushPromises();
    expect(mocks.info).toHaveBeenCalledWith("Chicory got there first.");
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith({ name: "play-handout", params: { id: "h-grell" } });
  });

  it("reports a real failure through the error toast", async () => {
    mocks.take.mockRejectedValue(new Error("Not at the table"));
    const w = await mountBoard({ presented_at: "2026-10-15T20:00:00Z" });
    await w.findComponent({ name: "AppButton" }).trigger("click");
    await flushPromises();
    expect(mocks.error).toHaveBeenCalledWith("Not at the table");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe("PlayerNoticeBoard others' takes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tells you when someone else tears a notice down, with a way to read it", async () => {
    const w = mount(PlayerNoticeBoard, { props: { board: board({ pins: [grellPoster, goatNote, ratsStub] }) }, global: { stubs } });
    const taken = pin({ ...grellPoster, status: "taken", taken_by_name: "Chicory", taken_session_number: 3, handout_id: "h-grell", quest_id: "q-grell" });
    await w.setProps({ board: board({ pins: [taken, goatNote, ratsStub] }) });
    await nextTick();
    expect(mocks.info).toHaveBeenCalledTimes(1);
    expect(mocks.info.mock.calls[0][0]).toBe("Chicory took the wanted poster for Grell Ashmantle.");
    mocks.info.mock.calls[0][2].action.run();
    expect(mocks.push).toHaveBeenCalledWith({ name: "play-handout", params: { id: "h-grell" } });
  });

  it("does not announce a stub that was already taken when the board opened", async () => {
    mount(PlayerNoticeBoard, { props: { board: board() }, global: { stubs } });
    expect(mocks.info).not.toHaveBeenCalled();
  });
});
