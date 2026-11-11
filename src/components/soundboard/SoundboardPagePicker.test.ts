import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SoundboardPage } from "@/types/sound.types";
import SoundboardPagePicker from "./SoundboardPagePicker.vue";

const updateMutate = vi.fn();

vi.mock("@/composables/soundboard/useSoundboardPages", () => ({
  useCreateSoundboardPage: () => ({ mutate: vi.fn() }),
  useUpdateSoundboardPage: () => ({ mutate: updateMutate }),
  useDeleteSoundboardPage: () => ({ mutate: vi.fn() }),
  useReorderSoundboardPages: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: ref(true) }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));

function page(id: string, sort: number): SoundboardPage {
  return { id, campaign_id: "c", user_id: "u", name: `Page ${id}`, sort_order: sort, lanes: [], created_at: "", updated_at: "" };
}
function mountPicker(modelValue: string | null) {
  return mount(SoundboardPagePicker, {
    props: { modelValue, pages: [page("a", 0), page("b", 1)] },
    global: {
      stubs: {
        PaywallModal: true,
        ProBadge: true,
        // The sheet teleports and animates; render its body inline.
        MobileSheet: { template: "<div><slot /><slot name='footer' /></div>" },
      },
    },
  });
}

beforeEach(() => updateMutate.mockReset());

describe("the phone page picker", () => {
  it("names the first page when none is chosen, as the deck shows it", () => {
    const w = mountPicker(null);
    expect(w.get("button").text()).toContain("Page a");
    expect(w.get("button").text()).toContain("1/2");
  });

  it("chooses a page tapped in the sheet", async () => {
    const w = mountPicker("a");
    await w.get('[data-page="b"] button').trigger("click");
    expect(w.emitted("update:modelValue")).toEqual([["b"]]);
  });

  it("renames once when the name is submitted and the field then blurs", async () => {
    const w = mountPicker("a");
    await w.get('[aria-label="Rename Page b"]').trigger("click");
    await w.get('[data-page="b"] input').setValue("Tavern");
    // Both fire before the row re-renders, as Enter followed by the field unmounting does.
    w.get('[data-page="b"] form').element.dispatchEvent(new Event("submit", { cancelable: true }));
    w.get('[data-page="b"] input').element.dispatchEvent(new Event("blur"));
    expect(updateMutate).toHaveBeenCalledOnce();
    expect(updateMutate.mock.calls[0]?.[0]).toEqual({ id: "b", update: { name: "Tavern" } });
  });
});
