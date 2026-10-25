import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { pendingInventionRow } from "@/composables/crafting/inventionQueue.fixture";
import { parseInvention } from "@/lib/crafting/invention";

const data = ref<{ invention: ReturnType<typeof parseInvention>; characterName: string }[]>([]);
const approve = vi.fn();
const returnWithNote = vi.fn();
const discard = vi.fn();
const confirm = vi.fn();
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => toast }));
vi.mock("@/composables/crafting/useInventionQueue", async (orig) => ({
  ...(await orig<typeof import("@/composables/crafting/useInventionQueue")>()),
  usePendingInventions: () => ({ data }),
  useDecideInvention: () => ({ approve, returnWithNote }),
  useDiscardInvention: () => ({ mutateAsync: discard }),
}));

import InventionApprovalQueue from "./InventionApprovalQueue.vue";

const stubs = { RouterLink: { template: "<a><slot /></a>" } };
const entry = () => ({ invention: parseInvention(pendingInventionRow()), characterName: "Nessa" });
const button = (w: ReturnType<typeof mount>, label: string) => w.findAll("button").find((b) => b.text().includes(label));

beforeEach(() => {
  data.value = [];
  for (const fn of [approve, returnWithNote, discard, confirm, toast.success, toast.error, toast.info]) fn.mockReset();
});

describe("InventionApprovalQueue", () => {
  it("renders nothing when nothing is pending", () => {
    const w = mount(InventionApprovalQueue, { global: { stubs } });
    expect(w.find("[data-testid=invention-queue]").exists()).toBe(false);
  });

  it("lists drafts with a count and the character", () => {
    data.value = [entry()];
    const w = mount(InventionApprovalQueue, { global: { stubs } });
    expect(w.text()).toContain("Inventions waiting for you");
    expect(w.get("[data-testid=invention-count]").text()).toBe("1");
    expect(w.text()).toContain("Invented by Nessa");
  });

  it("approve names the recipe in a toast", async () => {
    data.value = [entry()];
    approve.mockResolvedValue({ chatNotice: null });
    const w = mount(InventionApprovalQueue, { global: { stubs } });
    await button(w, "Approve")?.trigger("click");
    await flushPromises();
    expect(approve).toHaveBeenCalledWith(data.value[0]?.invention, "Nessa");
    expect(toast.success).toHaveBeenCalledWith("Approved: Songbird Automaton is in Nessa's recipes.");
  });

  it("a refused approval shows the server's refusal in words", async () => {
    data.value = [entry()];
    approve.mockRejectedValue({ code: "CX003" });
    const w = mount(InventionApprovalQueue, { global: { stubs } });
    await button(w, "Approve")?.trigger("click");
    await flushPromises();
    expect(toast.error).toHaveBeenCalledWith("This draft is no longer waiting for you.");
  });

  it("send back opens a note, needs text, then sends it", async () => {
    data.value = [entry()];
    returnWithNote.mockResolvedValue(undefined);
    const w = mount(InventionApprovalQueue, { global: { stubs } });
    await button(w, "Send back with a note")?.trigger("click");
    const send = button(w, "Send back");
    expect(send?.attributes("disabled")).toBeDefined();
    await w.get("textarea").setValue("Cheaper, please");
    await button(w, "Send back")?.trigger("click");
    await flushPromises();
    expect(returnWithNote).toHaveBeenCalledWith(data.value[0]?.invention, "Cheaper, please");
    expect(w.find("textarea").exists()).toBe(false);
  });

  it("discard asks first and does nothing when declined", async () => {
    data.value = [entry()];
    confirm.mockResolvedValue(false);
    const w = mount(InventionApprovalQueue, { global: { stubs } });
    await button(w, "Discard")?.trigger("click");
    await flushPromises();
    expect(discard).not.toHaveBeenCalled();
    confirm.mockResolvedValue(true);
    discard.mockResolvedValue(undefined);
    await button(w, "Discard")?.trigger("click");
    await flushPromises();
    expect(discard).toHaveBeenCalledWith("i1");
  });
});
