import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RoomAmbienceCell from "./RoomAmbienceCell.vue";
import ThemeInput from "@/components/common/ThemeInput.vue";
import type { ResolvedAmbience } from "@/lib/locations/ambience";

/**
 * The Ambience column's per-row cell (#868, frame "14 Room audio"). Covers
 * the four resolved states the frame's rows show, and that editing always
 * writes *this* location's own `audio_theme` — never the ancestor the
 * resolved value came from.
 */

function resolved(over: Partial<ResolvedAmbience>): ResolvedAmbience {
  return { theme: null, from: null, kind: "none", ...over };
}

describe("RoomAmbienceCell", () => {
  it("renders an inherited theme with a Set… affordance", () => {
    const wrapper = mount(RoomAmbienceCell, {
      props: {
        locationId: "room-1",
        ownTheme: null,
        resolved: resolved({ theme: "dungeon-wet", from: { id: "site-1", parent_id: null, audio_theme: "dungeon-wet", name: "Site" }, kind: "inherited" }),
        themeOptions: [],
      },
    });
    expect(wrapper.text()).toContain("Inherits ·");
    expect(wrapper.text()).toContain("dungeon-wet");
    expect(wrapper.text()).toContain("Set…");
  });

  it("renders an own theme as a chip with no Set… button", () => {
    const wrapper = mount(RoomAmbienceCell, {
      props: {
        locationId: "room-1",
        ownTheme: "shrine-choral",
        resolved: resolved({ theme: "shrine-choral", from: { id: "room-1", parent_id: null, audio_theme: "shrine-choral", name: "Reliquary" }, kind: "own" }),
        themeOptions: [],
      },
    });
    expect(wrapper.text()).toContain("Own theme →");
    expect(wrapper.text()).toContain("shrine-choral");
    expect(wrapper.text()).not.toContain("Set…");
  });

  it("renders a room's own silence as deliberate", () => {
    const wrapper = mount(RoomAmbienceCell, {
      props: {
        locationId: "room-1",
        ownTheme: "silence",
        resolved: resolved({ theme: null, from: { id: "room-1", parent_id: null, audio_theme: "silence", name: "Abbot's Cell" }, kind: "silence" }),
        themeOptions: [],
      },
    });
    expect(wrapper.text()).toContain("Deliberately silent →");
    expect(wrapper.text()).toContain("silence");
  });

  it("renders an inherited silence as an inheritance, not a declaration", () => {
    const wrapper = mount(RoomAmbienceCell, {
      props: {
        locationId: "room-1",
        ownTheme: null,
        resolved: resolved({ theme: null, from: { id: "site-1", parent_id: null, audio_theme: "silence", name: "Site" }, kind: "silence" }),
        themeOptions: [],
      },
    });
    expect(wrapper.text()).toContain("Inherits ·");
    expect(wrapper.text()).toContain("silence");
    expect(wrapper.text()).not.toContain("Deliberately silent");
  });

  it("renders none with no chip", () => {
    const wrapper = mount(RoomAmbienceCell, {
      props: { locationId: "room-1", ownTheme: null, resolved: resolved({}), themeOptions: [] },
    });
    expect(wrapper.text()).toContain("No ambience");
    expect(wrapper.text()).toContain("Set…");
  });

  it("emits save with this location's own id and the trimmed draft on Enter", async () => {
    const wrapper = mount(RoomAmbienceCell, {
      props: {
        locationId: "room-1",
        ownTheme: null,
        resolved: resolved({ theme: "dungeon-wet", from: { id: "site-1", parent_id: null, audio_theme: "dungeon-wet", name: "Site" }, kind: "inherited" }),
        themeOptions: ["dungeon-wet", "silence"],
      },
    });
    await wrapper.find("button").trigger("click"); // Set…
    const input = wrapper.getComponent(ThemeInput);
    await input.vm.$emit("update:modelValue", "  shrine-choral  ");
    await input.trigger("keydown.enter");

    expect(wrapper.emitted("save")).toEqual([["room-1", "shrine-choral"]]);
  });

  // `ThemeInput`'s root is a wrapping `<div>`, not its inner `<input>`, so a
  // plain `@blur` fallthrough listener would never fire — this locks in the
  // `@focusout` fix (focusout bubbles, blur does not).
  it("saves on focusout, the click-away path", async () => {
    const wrapper = mount(RoomAmbienceCell, {
      props: {
        locationId: "room-1",
        ownTheme: null,
        resolved: resolved({ theme: "dungeon-wet", from: { id: "site-1", parent_id: null, audio_theme: "dungeon-wet", name: "Site" }, kind: "inherited" }),
        themeOptions: [],
      },
    });
    await wrapper.find("button").trigger("click"); // Set…
    const input = wrapper.getComponent(ThemeInput);
    await input.vm.$emit("update:modelValue", "shrine-choral");
    await input.trigger("focusout");

    expect(wrapper.emitted("save")).toEqual([["room-1", "shrine-choral"]]);
  });

  it("emits null (inherit) when the draft is cleared to blank", async () => {
    const wrapper = mount(RoomAmbienceCell, {
      props: {
        locationId: "room-1",
        ownTheme: "shrine-choral",
        resolved: resolved({ theme: "shrine-choral", from: { id: "room-1", parent_id: null, audio_theme: "shrine-choral", name: "Reliquary" }, kind: "own" }),
        themeOptions: [],
      },
    });
    await wrapper.find("button").trigger("click"); // Edit
    const input = wrapper.getComponent(ThemeInput);
    await input.vm.$emit("update:modelValue", null);
    await input.trigger("keydown.enter");

    expect(wrapper.emitted("save")).toEqual([["room-1", null]]);
  });

  it("does not emit save when the draft is cancelled unchanged", async () => {
    const wrapper = mount(RoomAmbienceCell, {
      props: {
        locationId: "room-1",
        ownTheme: "shrine-choral",
        resolved: resolved({ theme: "shrine-choral", from: { id: "room-1", parent_id: null, audio_theme: "shrine-choral", name: "Reliquary" }, kind: "own" }),
        themeOptions: [],
      },
    });
    await wrapper.find("button").trigger("click");
    await wrapper.getComponent(ThemeInput).trigger("keydown.escape");

    expect(wrapper.emitted("save")).toBeUndefined();
    expect(wrapper.text()).toContain("shrine-choral"); // back to the read view
  });
});
