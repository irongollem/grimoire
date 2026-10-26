// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sharing = ref(true);
vi.mock("@/composables/soundboard/useAudioSharing", () => ({
  useAudioSharing: () => computed(() => sharing.value),
}));

const { default: SpotifyLocalOnlyInfo } = await import("./SpotifyLocalOnlyInfo.vue");

beforeEach(() => {
  sharing.value = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("SpotifyLocalOnlyInfo", () => {
  // A `title` never shows on a tablet, so the note has to open on a tap.
  it("opens the local-only note on a tap and closes it on the next", async () => {
    const wrapper = mount(SpotifyLocalOnlyInfo, { attachTo: document.body });
    const button = wrapper.get("button");

    expect(document.body.textContent).not.toContain("Plays on this device only");

    await button.trigger("click");
    expect(document.body.textContent).toContain("Plays on this device only");
    expect(button.attributes("aria-expanded")).toBe("true");

    await button.trigger("click");
    expect(document.body.textContent).not.toContain("Plays on this device only");
    wrapper.unmount();
  });

  // With nothing shared, "this device only" is true of everything.
  it("shows nothing while audio is neither shared nor cast", () => {
    sharing.value = false;
    const wrapper = mount(SpotifyLocalOnlyInfo, { attachTo: document.body });

    expect(wrapper.find("button").exists()).toBe(false);
    wrapper.unmount();
  });

  it("closes an open note when sharing stops", async () => {
    const wrapper = mount(SpotifyLocalOnlyInfo, { attachTo: document.body });
    await wrapper.get("button").trigger("click");

    sharing.value = false;
    await wrapper.vm.$nextTick();
    sharing.value = true;
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).not.toContain("Plays on this device only");
    wrapper.unmount();
  });
});
