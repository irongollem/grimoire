import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SoundboardPage } from "@/types/sound.types";
import SoundboardPageTabs from "./SoundboardPageTabs.vue";

const deleteMutate = vi.fn();
const confirm = vi.fn();

vi.mock("@/composables/soundboard/useSoundboardPages", () => ({
  useCreateSoundboardPage: () => ({ mutate: vi.fn() }),
  useUpdateSoundboardPage: () => ({ mutate: vi.fn() }),
  useDeleteSoundboardPage: () => ({ mutate: deleteMutate }),
  useReorderSoundboardPages: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: ref(true) }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm }) }));

const PAD = "application/x-grimoire-pad";
const SOUND = "application/x-grimoire-sound";

function page(id: string, sort: number): SoundboardPage {
  return { id, campaign_id: "c", user_id: "u", name: id, sort_order: sort, lanes: [], created_at: "", updated_at: "" };
}
function mountTabs(padCounts: Record<string, number> = {}) {
  return mount(SoundboardPageTabs, {
    props: { modelValue: "a", pages: [page("a", 0), page("b", 1)], padCounts },
    global: { stubs: { PaywallModal: true, ProBadge: true, AppButton: { template: "<button><slot /></button>" } } },
  });
}
function dragEvent(type: string, data: Record<string, string>): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { types: Object.keys(data), getData: (t: string) => data[t] ?? "" },
  });
  return event;
}
const tab = (w: ReturnType<typeof mountTabs>, id: string) => w.get(`[data-page-drop="${id}"]`);

// The delete button is the last control in a tab.
async function clickDelete(w: ReturnType<typeof mountTabs>, id: string) {
  await tab(w, id).find("button:last-child").trigger("click");
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  deleteMutate.mockReset();
  confirm.mockReset();
});

describe("a pad dropped on a tab", () => {
  it("asks the view to move that pad to that page", () => {
    const w = mountTabs();
    tab(w, "b").element.dispatchEvent(dragEvent("drop", { [PAD]: "pad-1" }));
    expect(w.emitted("padDrop")).toEqual([[{ pageId: "b", padId: "pad-1" }]]);
  });

  it("is not a drop target for a sound, which no longer moves between pages", () => {
    const w = mountTabs();
    const over = dragEvent("dragover", { [SOUND]: "s1" });
    tab(w, "b").element.dispatchEvent(over);
    tab(w, "b").element.dispatchEvent(dragEvent("drop", { [SOUND]: "s1" }));
    expect(over.defaultPrevented).toBe(false);
    expect(w.emitted("padDrop")).toBeUndefined();
  });
});

describe("deleting a page", () => {
  it("asks first when the page holds pads, and keeps it on Cancel", async () => {
    confirm.mockResolvedValue(false);
    const w = mountTabs({ b: 3 });
    await clickDelete(w, "b");
    expect(confirm).toHaveBeenCalledOnce();
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("deletes once confirmed, and without asking when the page is empty", async () => {
    confirm.mockResolvedValue(true);
    const held = mountTabs({ b: 3 });
    await clickDelete(held, "b");
    expect(deleteMutate).toHaveBeenCalledOnce();

    deleteMutate.mockReset();
    confirm.mockReset();
    await clickDelete(mountTabs(), "b");
    expect(confirm).not.toHaveBeenCalled();
    expect(deleteMutate).toHaveBeenCalledOnce();
  });
});
