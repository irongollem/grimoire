// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import NoticePinStub from "./NoticePinStub.vue";
import { takenGoat } from "./fixtures";

describe("NoticePinStub", () => {
  it("is a button named for who took the notice, and stays quiet until tapped", async () => {
    const w = mount(NoticePinStub, { props: { face: takenGoat } });
    expect(w.attributes("aria-label")).toBe("Taken by Aria, session 12");
    expect(w.find(".nb-stub-label").exists()).toBe(false);
    await w.trigger("click");
    expect(w.emitted("toggle")).toHaveLength(1);
  });

  it("shows the line when open", () => {
    const w = mount(NoticePinStub, { props: { face: takenGoat, open: true } });
    expect(w.find(".nb-stub-label").text()).toBe("Taken by Aria, session 12");
  });

  it("says only Taken when there is no name, and drops a missing session", () => {
    const anon = mount(NoticePinStub, { props: { face: { ...takenGoat, taken_by_name: null }, open: true } });
    expect(anon.find(".nb-stub-label").text()).toBe("Taken");
    const noSession = mount(NoticePinStub, { props: { face: { ...takenGoat, taken_session_number: null }, open: true } });
    expect(noSession.find(".nb-stub-label").text()).toBe("Taken by Aria");
  });

  it("leaves a torn parchment scrap for a note and poster paper for a poster, the same one every time", () => {
    const note = mount(NoticePinStub, { props: { face: takenGoat } });
    expect(note.attributes("data-scrap")).toMatch(/^scrap-/);
    expect(mount(NoticePinStub, { props: { face: takenGoat } }).attributes("data-scrap")).toBe(note.attributes("data-scrap"));
    const poster = mount(NoticePinStub, { props: { face: { ...takenGoat, style: "poster" } } });
    expect(poster.attributes("data-scrap")).toMatch(/^poster-scrap-/);
  });
});
