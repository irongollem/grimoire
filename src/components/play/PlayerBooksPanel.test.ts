import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import PlayerBooksPanel from "./PlayerBooksPanel.vue";

const mocks = vi.hoisted(() => ({ rows: undefined as { source_slug: string }[] | undefined }));

vi.mock("@/composables/library/useEnabledSources", () => ({
  useUserEnabledSources: () => ({ data: ref(mocks.rows) }),
}));

const Picker = { template: "<div><slot name='trigger' :open='false' :toggle='() => {}' /></div>" };

function mountPanel() {
  return mount(PlayerBooksPanel, { global: { stubs: { PlayerBooksPicker: Picker } } });
}

describe("PlayerBooksPanel", () => {
  it("explains what the books are for and offers the picker", () => {
    mocks.rows = [];
    const w = mountPanel();
    expect(w.text()).toContain("Your books");
    expect(w.text()).toContain("A table decides which books it takes.");
    expect(w.text()).toContain("Choose books");
  });

  it("says only the SRDs are on when the player added none", () => {
    mocks.rows = [];
    expect(mountPanel().get("[data-testid=books-summary]").text()).toBe("Only the SRDs are on.");
  });

  it("counts the books beyond the SRDs", () => {
    mocks.rows = [{ source_slug: "toh" }];
    expect(mountPanel().get("[data-testid=books-summary]").text()).toBe("1 book on beyond the SRDs.");
    mocks.rows = [{ source_slug: "toh" }, { source_slug: "kp" }];
    expect(mountPanel().get("[data-testid=books-summary]").text()).toBe("2 books on beyond the SRDs.");
  });

  it("says nothing about the count while the rows load", () => {
    mocks.rows = undefined;
    expect(mountPanel().get("[data-testid=books-summary]").text()).toBe("");
  });
});
