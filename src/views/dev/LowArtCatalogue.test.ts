import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { useLowArt } from "@/composables/useLowArt";
import LowArtCatalogue from "./LowArtCatalogue.vue";

const global = { stubs: { RouterLink: { template: "<a><slot /></a>" } } };

afterEach(() => {
  useLowArt().setLowArt(false);
});

describe("LowArtCatalogue", () => {
  it("shows the ledger heads even when the viewer has low art off", () => {
    // Fails if the section stops forcing low art on: the ledger then draws plain rows.
    useLowArt().setLowArt(false);
    const w = mount(LowArtCatalogue, { global });
    expect(w.find("[data-ledger-head]").exists()).toBe(true);
    w.unmount();
  });

  it("never touches the viewer's own stored switch", () => {
    // Fails if the section flips the persisted switch: a tab closed mid-visit would leave it on.
    useLowArt().setLowArt(false);
    const w = mount(LowArtCatalogue, { global });
    expect(useLowArt().lowArt.value).toBe(false);
    expect(localStorage.getItem("grimoire_low_art")).not.toBe("true");
    w.unmount();
  });
});
