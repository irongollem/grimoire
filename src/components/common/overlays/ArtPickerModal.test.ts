import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ArtPickerModal from "./ArtPickerModal.vue";

const mocks = vi.hoisted(() => ({ listOwnedPaths: vi.fn() }));

vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage")>()),
  listOwnedPaths: (...args: unknown[]) => mocks.listOwnedPaths(...args),
  getPublicUrl: (_bucket: string, path: string) => `https://cdn.test/${path}`,
}));

describe("ArtPickerModal", () => {
  // Fails on: the picker opening on NPC Art (or any other category), an empty page for a DM whose pictures were
  // uploaded in the Scriptorium, which files every upload under Document Art.
  it("opens on Document Art, where the Scriptorium keeps its pictures", async () => {
    mocks.listOwnedPaths.mockResolvedValue(["u1/glass-hound.webp"]);
    const wrapper = mount(ArtPickerModal, { props: { show: false }, global: { stubs: { teleport: true } } });
    await wrapper.setProps({ show: true });
    await flushPromises();
    expect(mocks.listOwnedPaths).toHaveBeenCalledTimes(1);
    expect(mocks.listOwnedPaths).toHaveBeenCalledWith("assetImages", "u1");
  });
});
