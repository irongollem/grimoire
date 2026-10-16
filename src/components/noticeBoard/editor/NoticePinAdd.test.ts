// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import NoticePinAdd from "./NoticePinAdd.vue";

describe("NoticePinAdd", () => {
  it("offers the four kinds of notice and says which was chosen", async () => {
    const w = mount(NoticePinAdd);
    const labels = w.findAll("button").map((b) => b.text());
    expect(labels).toEqual(["Note", "Wanted poster", "Sealed letter", "Picture"]);
    await w.findAll("button")[1].trigger("click");
    expect(w.emitted("add")?.[0]).toEqual(["poster"]);
  });

  it("is inert while a notice is being created", () => {
    const w = mount(NoticePinAdd, { props: { disabled: true } });
    expect(w.findAll("button").every((b) => b.attributes("disabled") !== undefined)).toBe(true);
  });
});
