// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";

const m = vi.hoisted(() => ({ confirm: vi.fn(), show: vi.fn() }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: m.confirm }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: String }) }));
vi.mock("@/composables/bookNook/useShowNookAtPlace", () => ({ useShowNookAtPlace: () => ({ mutateAsync: m.show }) }));
vi.mock("@/composables/bookNook/useBookNooks", () => ({
  useBookNooks: () => ({ data: ref([{ id: "n1", title: "Stag" }, { id: "n2", title: "The Hall" }]) }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useAllLocations: () => ({
    data: ref([
      { id: "p1", name: "Free Place", book_nook_id: null },
      { id: "p2", name: "Taken Place", book_nook_id: "n2" },
      { id: "p3", name: "Own Place", book_nook_id: "n1" },
    ]),
  }),
}));

import ShowNookAtPlaceDialog from "./ShowNookAtPlaceDialog.vue";
import type { BookNook } from "@/types/bookNook.types";

const Combo = {
  props: ["modelValue", "options"],
  emits: ["update:modelValue"],
  template:
    "<div><i data-testid='names'>{{ options.map((o) => o.name).join('|') }}</i><button v-for='o in options' :key='o.id' :data-pick='o.id' @click=\"$emit('update:modelValue', o.id)\" /></div>",
};
const stubs = {
  AppModal: { template: "<div><slot /></div>" },
  ModalHeader: true,
  EntityCombobox: Combo,
  AppButton: { props: ["label", "disabled"], emits: ["click"], template: "<button :data-label='label' :disabled='disabled' @click=\"$emit('click')\" />" },
};
const nook = { id: "n1", title: "Stag" } as unknown as BookNook;
const mountIt = () => mount(ShowNookAtPlaceDialog, { props: { open: true, nook }, global: { stubs } });
const go = (d: ReturnType<typeof mountIt>) => d.get("[data-label='Show here']");

beforeEach(() => {
  vi.clearAllMocks();
  m.show.mockResolvedValue(undefined);
});

describe("ShowNookAtPlaceDialog", () => {
  it("marks places that show another nook and leaves out the one that shows this", () => {
    expect(mountIt().get("[data-testid=names]").text()).toBe("Free Place|Taken Place (shows The Hall)");
  });

  it("shows the nook at a free place without asking", async () => {
    const d = mountIt();
    await d.get("[data-pick=p1]").trigger("click");
    await go(d).trigger("click");
    await flushPromises();
    expect(m.confirm).not.toHaveBeenCalled();
    expect(m.show).toHaveBeenCalledWith({ locationId: "p1", nookId: "n1" });
    expect(d.emitted("close")).toHaveLength(1);
  });

  it("does not take a place off another nook when the DM declines", async () => {
    // Bug: choosing a place that shows another nook silently displaced it.
    m.confirm.mockResolvedValue(false);
    const d = mountIt();
    await d.get("[data-pick=p2]").trigger("click");
    await go(d).trigger("click");
    await flushPromises();
    expect(m.confirm).toHaveBeenCalledWith("Taken Place shows The Hall now. Show this one instead?", expect.anything());
    expect(m.show).not.toHaveBeenCalled();
    m.confirm.mockResolvedValue(true);
    await go(d).trigger("click");
    await flushPromises();
    expect(m.show).toHaveBeenCalledWith({ locationId: "p2", nookId: "n1" });
  });
});
